import { ref, watch } from 'vue'
import { AssignmentsApi } from '@/api'
import { apiConfig, useAppStore, useAuthStore, usePlanningStore, useTimesheetStore } from '@/store'
import { isOffline } from './state'
import { isElectron } from '@/electron'

/**
 * Background "warmup" of the offline data cache: after login (and on network return,
 * and periodically while the user is online) it sequentially requests the same
 * GETs the pages use. Successful responses are automatically written to
 * IndexedDB (src/http.ts), so offline opens even data of pages
 * the user never visited.
 *
 * Limitations: does not run while offline; requests run sequentially with a
 * pause at the WARMUP_RATE_PER_SECOND rate (10/sec); a repeated start is
 * ignored while the previous one is still running.
 */

/** Warmup request rate (requests/sec) — no parallelism, just more frequent */
const WARMUP_RATE_PER_SECOND = 10
/** Pause between warmup steps (1000 ms / 10 = 100 ms) */
const PAUSE_MS = 1000 / WARMUP_RATE_PER_SECOND
const IDLE_TIMEOUT_MS = 2000
/** Periodic cache refresh while the user is online (data does not go stale) */
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

/** Time of the last warmup run (for the profile UI; survives reloads) */
export const lastWarmedAt = ref<number | null>(readLastWarmed())

/** Warmup progress 0..100, null — no warmup running (for the UI indicator) */
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

/** Warmup steps per user role (heavy requests — at the end of the queue) */
function buildSteps(): Array<() => Promise<unknown>> {
  const auth = useAuthStore()
  const app = useAppStore()
  const planning = usePlanningStore()
  const ts = useTimesheetStore()

  const role = auth.user?.role ?? ''
  const isStaff = role === 'vp' || role === 'admin'

  // worker does not read data (profile only) — nothing to warm
  if (role === 'worker') return []

  const steps: Array<() => Promise<unknown>> = [
    () => app.loadProjects(),
    () => app.loadResources(),
    () => app.loadUsers(),
    () => planning.loadProjectPlanning(),
    () => planning.loadProcessPlanning(),
    () => planning.loadTaskPlanning(),
    // Assignments reference (fallback in removeResource)
    () => new AssignmentsApi(apiConfig()).assignmentGet(500, undefined, 0),
  ]
  if (auth.user?.id != null) {
    steps.push(() => auth.fetchProfile(auth.user!.id as number))
  }
  if (isStaff) {
    steps.push(() => ts.loadStates())
    // Employees + states window (timesheet periods)
    steps.push(() => ts.loadEmployees())
  }
  // Availability calendar (540 days) — the heaviest, warmed last
  steps.push(() => app.loadCalendar())
  return steps
}

async function warmUp(): Promise<void> {
  const steps = buildSteps()
  const total = steps.length
  let done = 0
  warmupProgress.value = total > 0 ? 0 : null
  for (const step of steps) {
    // Stop warmup: offline OR the user logged out. Otherwise the loop
    // keeps sending requests without a token — every 401 triggers a refresh attempt
    // of the revoked session and produces false "Session expired, log in again" messages.
    if (isOffline.value || !useAuthStore().isAuthenticated) break
    try {
      await step()
    } catch {
      // a single request failed — don't abort the whole warmup
    }
    done++
    warmupProgress.value = total > 0 ? Math.round((done / total) * 100) : null
    if (isOffline.value) break
    await pause()
  }
  console.log(`[warmup] прогрето запросов: ${done}`)
}

/**
 * Warm up immediately (without waiting for idle) — the "Warm data" button in the profile.
 * Returns true if the warmup is actually started; false — if it was
 * skipped (offline or another one is already running).
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
        // the timestamp is not critical — it will update on the next run
      }
      return true
    })
    .finally(() => {
      running = false
      warmupProgress.value = null
    })
}

/** Schedules warmup when idle. Idempotent (one run at a time).
 *  Offline cache warmup — only in the desktop (Electron) build. */
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

// While the user is online and authorized — periodically refresh the cache
function ensureRewarmTimer(): void {
  if (rewarmTimer != null) return
  rewarmTimer = window.setInterval(() => {
    if (!isOffline.value && useAuthStore().isAuthenticated) {
      void warmNow()
    }
  }, REWARM_INTERVAL_MS)
}

if (isElectron && typeof window !== 'undefined') ensureRewarmTimer()

// Network return → warm what was not finished (or load fresh data)
watch(isOffline, (offline) => {
  if (isElectron && !offline) scheduleWarmup()
})
