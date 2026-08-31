import { ref } from 'vue'
import { AssignmentsApi } from '@/api'
import { apiConfig, useAppStore, useAuthStore, usePlanningStore, useRbacStore, useTimesheetStore } from '@/store'
import { isOffline } from './state'
import { isElectron } from '@/electron'
import { cacheGetFresh } from './cache'
import { apiPath } from './hydrate'

/**
 * Background PULL: refreshes the offline data cache from the backend.
 *
 * Rendering is local-first (hydrateFromCache) — pages NEVER fetch. The ONLY
 * network GETs belong here (plus auth/health/probe):
 *  - full warmup: after login / re-login, on network return, manual "Обновить";
 *  - the 10-second maintenance cycle (offline/cycle.ts) refreshes only domains
 *    whose cached copy is older than its TTL — no constant unnecessary GETs.
 *
 * Requests run sequentially at WARMUP_RATE_PER_SECOND (10/sec); a repeated
 * start is ignored while the previous one is still running.
 */

const WARMUP_RATE_PER_SECOND = 10
/** Pause between warmup steps (1000 ms / 10 = 100 ms) */
const PAUSE_MS = 1000 / WARMUP_RATE_PER_SECOND
const IDLE_TIMEOUT_MS = 2000

/** Default per-domain staleness: a cached copy younger than TTL is not re-fetched */
export const PULL_TTL_MS = 60 * 1000

let running = false
let scheduled = false

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

export interface PullStep {
  name: string
  /** Cache endpoint used for the TTL staleness check */
  path: string
  /** Optional key filter for endpoints shared by several queries */
  keyPredicate?: (key: string) => boolean
  /** The network refresh (owns the GET) */
  refresh: () => Promise<unknown>
  /** Staleness limit; the step is skipped while the cache copy is younger */
  ttl?: number
  /** If true — never pulled by the 10-second cycle (heavy/logical), full warmup only */
  cycle?: boolean
}

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

/** PULL steps per user role (heavy requests at the end of the queue) */
export function buildPullSteps(): PullStep[] {
  const auth = useAuthStore()
  const app = useAppStore()
  const planning = usePlanningStore()
  const ts = useTimesheetStore()
  const rbac = useRbacStore()

  const role = auth.user?.role ?? ''
  const isStaff = role === 'vp' || role === 'admin'
  const userId = auth.user?.id

  // worker does not read data (profile only) — nothing to warm
  if (role === 'worker') return []

  const steps: PullStep[] = [
    {
      name: 'permissions',
      path: apiPath('/permissions/me'),
      refresh: () => rbac.refreshPermissions(),
    },
    ...(userId != null
      ? [
          {
            name: 'profile',
            path: apiPath(`/user/${userId}`),
            refresh: () => auth.fetchProfile(userId),
          },
        ]
      : []),
    { name: 'projects', path: apiPath('/projects'), refresh: () => app.refreshProjects() },
    { name: 'resources', path: apiPath('/resources'), refresh: () => app.refreshResources() },
    { name: 'users', path: apiPath('/user/all'), refresh: () => app.refreshUsers() },
    {
      name: 'project-plan',
      path: apiPath('/planning/projects'),
      refresh: () => planning.refreshProjectPlanning(true),
    },
    {
      name: 'process-plan',
      path: apiPath('/planning/processes'),
      refresh: () => planning.refreshProcessPlanning(true),
    },
    {
      name: 'task-plan',
      path: apiPath('/planning/tasks'),
      refresh: () => planning.refreshTaskPlanning(true),
    },
    // Assignments reference (fallback in removeResource)
    {
      name: 'assignments',
      path: apiPath('/assignment'),
      refresh: () => new AssignmentsApi(apiConfig()).assignmentGet(500, undefined, 0),
    },
  ]
  if (isStaff) {
    steps.push({
      name: 'states',
      path: apiPath('/timesheet/states'),
      refresh: () => ts.refreshStates(),
    })
    steps.push({
      name: 'employees',
      path: apiPath('/user'),
      keyPredicate: (key) => /\brole=worker\b/.test(key),
      refresh: () => ts.refreshEmployees(),
    })
    // Timesheet periods are per-employee, date-windowed: staleness cannot be
    // cheaply checked per domain — pull them only on full warmup / reconcile.
    steps.push({
      name: 'periods',
      path: '',
      refresh: () =>
        ts.windowStart
          ? ts.refreshPeriods(ts.windowStart, ts.windowEnd)
          : Promise.resolve(),
      cycle: false,
    })
  }
  // Availability calendar (540 days) — the heaviest, warmed last
  steps.push({ name: 'calendar', path: apiPath('/timesheet/calendar'), refresh: () => app.refreshCalendar() })
  return steps
}

/** Whether the cached copy of `step` is still fresh (younger than its TTL). */
async function isStepFresh(step: PullStep): Promise<boolean> {
  const ttl = step.ttl ?? PULL_TTL_MS
  if (!step.path) return false
  const entry = await cacheGetFresh<unknown>(step.path, step.keyPredicate)
  return entry != null && Date.now() - entry.ts < ttl
}

/**
 * Runs the pull steps sequentially with a rate pause. `cycle` mode skips heavy
 * steps flagged cycle:false and refreshes only stale domains. Stops on offline
 * or logout (otherwise every 401 would trigger session refresh attempts).
 */
async function runPull(settings: { cycle: boolean }): Promise<number> {
  const steps = buildPullSteps()
  const targets = settings.cycle ? steps.filter((s) => s.cycle !== false) : steps
  const total = targets.length
  let done = 0
  let refreshed = 0
  warmupProgress.value = total > 0 ? 0 : null
  for (const step of targets) {
    if (isOffline.value || !useAuthStore().isAuthenticated) break
    // The cycle only refreshes data that actually went stale.
    if (settings.cycle && (await isStepFresh(step))) {
      done++
      continue
    }
    try {
      await step.refresh()
      refreshed++
    } catch {
      // a single request failed — don't abort the whole warmup
    }
    done++
    warmupProgress.value = total > 0 ? Math.round((done / total) * 100) : null
    if (isOffline.value) break
    await pause()
  }
  console.log(`[warmup] прогрето запросов: ${done} (обновлено: ${refreshed})`)
  return refreshed
}

/**
 * Full (TTL-aware) warmup — the "Warm data"/"Обновить" path. Returns true if
 * actually started.
 */
export function warmNow(): Promise<boolean> {
  if (!isElectron) return Promise.resolve(false)
  if (running || isOffline.value) return Promise.resolve(false)
  running = true
  return runPull({ cycle: false })
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

/**
 * The 10-second cycle PULL: refreshes only stale domains (younger copies are
 * left alone — no constant unnecessary GETs). Returns the number of domains
 * refreshed (0 — everything was already fresh).
 */
export function pullStaleCycle(): Promise<number> {
  if (running) return Promise.resolve(0)
  running = true
  return runPull({ cycle: true })
    .then((refreshed) => {
      if (refreshed > 0) {
        lastWarmedAt.value = Date.now()
        try {
          localStorage.setItem(LAST_WARMED_KEY, String(lastWarmedAt.value))
        } catch {
          // ignore
        }
      }
      return refreshed
    })
    .finally(() => {
      running = false
      warmupProgress.value = null
    })
}

/** Schedules full warmup when idle. Idempotent (one run at a time).
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