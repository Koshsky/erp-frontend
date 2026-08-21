import { ref, watch } from 'vue'
import { AssignmentsApi } from '@/api'
import { apiConfig, useAppStore, useAuthStore, usePlanningStore, useTimesheetStore } from '@/store'
import { isOffline } from './state'
import { isElectron } from '@/electron'

/**
 * Фоновая «прогревка» офлайн-кэша данных: после логина (и при возврате сети,
 * и периодически, пока пользователь онлайн) последовательно запрашивает те же
 * GET, что используют страницы. Успешные ответы автоматически пишутся в
 * IndexedDB (src/http.ts), поэтому офлайн открываются данные даже тех страниц,
 * где пользователь не был.
 *
 * Ограничения: не запускается, пока офлайн; запросы идут последовательно с
 * паузой по ставке WARMUP_RATE_PER_SECOND (10/сек); повторный запуск
 * игнорируется, пока предыдущий не закончился.
 */

/** Частота запросов прогревки (шт/сек) — без параллельности, просто чаще */
const WARMUP_RATE_PER_SECOND = 10
/** Пауза между шагами прогревки (1000 мс / 10 = 100 мс) */
const PAUSE_MS = 1000 / WARMUP_RATE_PER_SECOND
const IDLE_TIMEOUT_MS = 2000
/** Периодическое обновление кэша, пока пользователь онлайн (данные не протухают) */
const REWARM_INTERVAL_MS = 30 * 60 * 1000

let running = false
let scheduled = false
let rewarmTimer: number | null = null

const LAST_WARMED_KEY = 'mvs_erp_last_warmed_at'

function readLastWarmed(): number | null {
  try {
    const raw = localStorage.getItem(LAST_WARMED_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** Время последнего запуска прогревки (для UI профиля; переживает перезагрузки) */
export const lastWarmedAt = ref<number | null>(readLastWarmed())

/** Прогресс прогревки 0..100, null — прогревка не идёт (для индикатора в UI) */
export const warmupProgress = ref<number | null>(null)

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

  // worker не читает данные (только профиль) — прогревать нечего
  if (role === 'worker') return []

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
  const total = steps.length
  let done = 0
  warmupProgress.value = total > 0 ? 0 : null
  for (const step of steps) {
    if (isOffline.value) break
    try {
      await step()
    } catch {
      // отдельный запрос упал — не валим всю прогревку
    }
    done++
    warmupProgress.value = total > 0 ? Math.round((done / total) * 100) : null
    if (isOffline.value) break
    await pause()
  }
  console.log(`[warmup] прогрето запросов: ${done}`)
}

/**
 * Прогревка сразу (без ожидания простоя) — кнопка «Прогреть данные» в профиле.
 * Возвращает true, если прогревка действительно запущена; false — если она
 * пропущена (офлайн или уже идёт другая).
 */
export function warmNow(): Promise<boolean> {
  if (!isElectron) return Promise.resolve(false)
  if (running || isOffline.value) return Promise.resolve(false)
  running = true
  return warmUp()
    .then(() => {
      lastWarmedAt.value = Date.now()
      try {
        localStorage.setItem(LAST_WARMED_KEY, String(lastWarmedAt.value))
      } catch {
        // метка не критична — при следующем прогоне обновится
      }
      return true
    })
    .finally(() => {
      running = false
      warmupProgress.value = null
    })
}

/** Планирует прогревку при простое. Идемпотентна (один запуск за раз).
 *  Прогревка офлайн-кэша — только в настольной (Electron) сборке. */
export function scheduleWarmup(): void {
  if (!isElectron) return
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

if (isElectron && typeof window !== 'undefined') ensureRewarmTimer()

// Возврат сети → прогреваем то, что не успели (или подгружаем свежее)
watch(isOffline, (offline) => {
  if (isElectron && !offline) scheduleWarmup()
})
