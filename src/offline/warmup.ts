import { ref, watch } from 'vue'
import { AssignmentsApi } from '@/api'
import { apiConfig, useAppStore, useAuthStore, usePlanningStore, useTimesheetStore } from '@/store'
import { isOffline } from './state'

/**
 * Фоновая «прогревка» офлайн-кэша данных: после логина (и при возврате сети,
 * и периодически, пока пользователь онлайн) последовательно запрашивает те же
 * GET, что используют страницы. Успешные ответы автоматически пишутся в
 * IndexedDB (src/http.ts), поэтому офлайн открываются данные даже тех страниц,
 * где пользователь не был.
 *
 * Ограничения: не запускается, пока офлайн; запросы идут с паузами (мягко для
 * сервера); повторный запуск игнорируется, пока предыдущий не закончился.
 */

const PAUSE_MS = 1500
const IDLE_TIMEOUT_MS = 2000
/** Периодическое обновление кэша, пока пользователь онлайн (данные не протухают) */
const REWARM_INTERVAL_MS = 30 * 60 * 1000

let running = false
let scheduled = false
let rewarmTimer: number | null = null

/** Время последней успешной прогревки (для UI профиля) */
export const lastWarmedAt = ref<number | null>(null)

function runWhenIdle(fn: () => void): void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts: { timeout: number }) => number
  }
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS })
  } else {
    window.setTimeout(fn, IDLE_TIMEOUT_MS)
  }
}

function pause(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, PAUSE_MS))
}

/** Набор прогревки под роль пользователя (тяжёлые запросы — в конец очереди) */
function buildSteps(): Array<() => Promise<unknown>> {
  const auth = useAuthStore()
  const app = useAppStore()
  const planning = usePlanningStore()
  const ts = useTimesheetStore()

  const role = auth.user?.role ?? ''
  const isStaff = role === 'vp' || role === 'admin'

  const steps: Array<() => Promise<unknown>> = [
    () => app.loadProjects(),
    () => app.loadResources(),
    () => app.loadUsers(),
    () => planning.loadProjectPlanning(),
    () => planning.loadProcessPlanning(),
    () => planning.loadTaskPlanning(),
    // Справочник назначений (fallback в removeResource)
    () => new AssignmentsApi(apiConfig()).assignmentGet(500, undefined, 0),
  ]
  if (auth.user?.id != null) {
    steps.push(() => auth.fetchProfile(auth.user!.id as number))
  }
  if (isStaff) {
    steps.push(() => ts.loadStates())
    // Сотрудники + окно состояний (периоды табеля)
    steps.push(() => ts.loadEmployees())
  }
  // Календарь доступности (540 дней) — самое тяжёлое, прогревается последним
  steps.push(() => app.loadCalendar())
  return steps
}

async function warmUp(): Promise<void> {
  const steps = buildSteps()
  let done = 0
  for (const step of steps) {
    if (isOffline.value) return
    try {
      await step()
    } catch {
      // отдельный запрос упал — не валим всю прогревку
    }
    done++
    if (isOffline.value) return
    await pause()
  }
  console.log(`[warmup] прогрето запросов: ${done}`)
}

/** Прогревка сразу (без ожидания простоя) — кнопка «Прогреть данные» в профиле */
export function warmNow(): Promise<void> {
  if (running) return Promise.resolve()
  if (isOffline.value) return Promise.resolve()
  running = true
  return warmUp().finally(() => {
    running = false
    lastWarmedAt.value = Date.now()
  })
}

/** Планирует прогревку при простое. Идемпотентна (один запуск за раз). */
export function scheduleWarmup(): void {
  if (running || scheduled) return
  if (isOffline.value) return
  if (!useAuthStore().isAuthenticated) return
  scheduled = true
  runWhenIdle(() => {
    scheduled = false
    void warmNow()
  })
}

// Пока пользователь онлайн и авторизован — периодически обновляем кэш
function ensureRewarmTimer(): void {
  if (rewarmTimer != null) return
  rewarmTimer = window.setInterval(() => {
    if (!isOffline.value && useAuthStore().isAuthenticated) {
      void warmNow()
    }
  }, REWARM_INTERVAL_MS)
}

if (typeof window !== 'undefined') ensureRewarmTimer()

// Возврат сети → прогреваем то, что не успели (или подгружаем свежее)
watch(isOffline, (offline) => {
  if (!offline) scheduleWarmup()
})
