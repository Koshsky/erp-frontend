import { watch } from 'vue'
import { useAppStore, useAuthStore, usePlanningStore, useTimesheetStore } from '@/store'
import { isOffline } from './state'

/**
 * Фоновая «прогревка» офлайн-кэша данных: после логина (и при возврате сети)
 * в моменты простоя последовательно запрашивает те же GET, что используют
 * страницы. Успешные ответы автоматически пишутся в IndexedDB (src/http.ts),
 * поэтому офлайн открываются данные даже тех страниц, где пользователь не был.
 *
 * Ограничения: не запускается, пока офлайн; запросы идут с паузами (мягко для
 * сервера); повторный запуск игнорируется, пока предыдущий не закончился.
 */

const PAUSE_MS = 1500
const IDLE_TIMEOUT_MS = 5000

let running = false
let scheduled = false

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
  for (const step of buildSteps()) {
    if (isOffline.value) return
    try {
      await step()
    } catch {
      // отдельный запрос упал — не валим всю прогревку
    }
    if (isOffline.value) return
    await pause()
  }
}

/** Планирует прогревку при простое. Идемпотентна (один запуск за раз). */
export function scheduleWarmup(): void {
  if (running || scheduled) return
  if (isOffline.value) return
  if (!useAuthStore().isAuthenticated) return
  scheduled = true
  runWhenIdle(() => {
    scheduled = false
    if (running) return
    running = true
    warmUp().finally(() => {
      running = false
    })
  })
}

// Возврат сети → прогреваем то, что не успели (или подгружаем свежее)
watch(isOffline, (offline) => {
  if (!offline) scheduleWarmup()
})
