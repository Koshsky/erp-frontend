import { ref, watch } from 'vue'
import { useAppStore, useAuthStore, usePlanningStore, useTimesheetStore } from '@/store'
import { shouldAutoSync } from '@/settings'
import { isElectron } from '@/electron'
import { getSyncCredentials } from '@/syncCredentials'
import { isLoggedOut } from '@/loggedOut'
import { warmNow } from './warmup'
import {
  flushOutbox,
  pendingCount,
  refreshPendingCount,
  replayOutboxToCache,
  resetFailedRetries,
  type FailedSyncItem,
  type MutationEntity,
} from './outbox'
import { isOffline } from './state'

/**
 * Offline queue synchronization: when the network returns (and at app startup
 * with a saved queue) sends accumulated mutations to the backend, then
 * re-reads affected domains from the server — server truth wins,
 * and changes that could not be applied are visually rolled back.
 */

export interface SyncNoticeData {
  ok: number
  failed: number
  interrupted: boolean
  /** Unsent entries with reasons (for the toast) */
  failedEntries: FailedSyncItem[]
}

/** Result of the last sync (shown in the toast) */
export const syncNotice = ref<SyncNoticeData | null>(null)

export function dismissSyncNotice(): void {
  syncNotice.value = null
}

const LAST_PUSH_KEY = 'mvs_erp_last_push_at'

function readLastPush(): number | null {
  try {
    const raw = localStorage.getItem(LAST_PUSH_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** Time of the last successful queue push (for UI; survives reloads) */
export const lastPushAt = ref<number | null>(readLastPush())

function noteLastPush(): void {
  lastPushAt.value = Date.now()
  try {
    localStorage.setItem(LAST_PUSH_KEY, String(lastPushAt.value))
  } catch {
    // the timestamp is not critical — it will update on the next run
  }
}

let reconciling = false

interface Reloader {
  name: string
  run: () => Promise<unknown>
}

function reload(name: string, run: () => Promise<unknown>): Reloader {
  return { name, run }
}

/** Reload set per role (heavy ones — on demand). Network refreshes only
 *  (refreshX): rendering is local-first, so reconcile must NOT re-fetch via
 *  the local loaders. */
function reloadersFor(entity: MutationEntity): Reloader[] {
  const app = useAppStore()
  const planning = usePlanningStore()
  const ts = useTimesheetStore()
  const auth = useAuthStore()
  const isStaff = auth.user?.preset === 'vp' || auth.user?.preset === 'admin'

  switch (entity) {
    case 'resource':
      return [reload('resources', () => app.refreshResources()), reload('calendar', () => app.refreshCalendar())]
    case 'user':
      return isStaff ? [reload('employees', () => ts.refreshEmployees())] : []
    case 'member':
      return isStaff ? [reload('resources', () => app.refreshResources())] : []
    case 'state':
      return isStaff ? [reload('states', () => ts.refreshStates())] : []
    case 'period':
      return isStaff
        ? [
            reload('employees', () => ts.refreshEmployees()),
            ...(ts.windowStart
              ? [reload('periods', () => ts.refreshPeriods(ts.windowStart, ts.windowEnd))]
              : []),
          ]
        : []
    case 'project':
      return [
        reload('project-plan', () => planning.refreshProjectPlanning(true)),
        reload('projects', () => app.refreshProjects()),
      ]
    case 'process':
      return [reload('process-plan', () => planning.refreshProcessPlanning(true))]
    case 'task':
    case 'milestone':
    case 'assignment':
      return [reload('task-plan', () => planning.refreshTaskPlanning(true))]
    case 'reorder':
      return [
        reload('project-plan', () => planning.refreshProjectPlanning(true)),
        reload('projects', () => app.refreshProjects()),
      ]
    default:
      return []
  }
}

async function reconcile(entities: Set<MutationEntity>): Promise<void> {
  const runs = new Map<string, () => Promise<unknown>>()
  for (const entity of entities) {
    for (const r of reloadersFor(entity)) {
      if (!runs.has(r.name)) runs.set(r.name, r.run)
    }
  }
  for (const run of runs.values()) {
    try {
      await run()
    } catch {
      // a single reload failed — data will be fetched on the next access
    }
  }
}

async function runSync(): Promise<void> {
  if (reconciling) return
  reconciling = true
  try {
    const res = await flushOutbox()
    if (res.ok > 0 || res.failed > 0 || res.interrupted) {
      if (res.ok > 0) noteLastPush()
      await reconcile(res.entities)
      syncNotice.value = {
        ok: res.ok,
        failed: res.failed,
        interrupted: res.interrupted,
        failedEntries: res.failedEntries,
      }
    }
  } finally {
    reconciling = false
  }
}

/**
 * The "PUSH" button on the sync screen: queue flush + reconcile.
 * In-app synchronous calls (autosync) go through initOfflineSync.
 */
export function syncNow(): Promise<void> {
  return runSync()
}

/**
 * The "Sync all" button: PUSH (queue flush) then, if the network
 * is alive, PULL (offline cache warmup). Parts are independent: a failed one
 * does not break the other. Returns what actually ran (for the UI message).
 */
export async function syncAll(): Promise<{ pushed: boolean; pulled: boolean }> {
  try {
    await runSync()
    const n = syncNotice.value
    const pushed = n != null && (n.ok > 0 || n.failed > 0 || n.interrupted)
    let pulled = false
    if (!isOffline.value) {
      pulled = await warmNow()
    }
    return { pushed, pulled }
  } finally {
    // runSync/warmNow reset their own locks and progress
  }
}

/** The "Retry" button: lift quarantine and try sending again */
export async function retryFailed(): Promise<void> {
  await resetFailedRetries()
  await runSync()
}

/** The "Skip" button: removes rejected entries (see outbox) */
export { discardFailed } from './outbox'

/** Queue flushing & PULL are driven by the single 10-second maintenance cycle (offline/cycle.ts). */

/** Initialization: reconcile at startup with a queue + trigger on network return */
export async function initOfflineSync(): Promise<void> {
  // Write-through into the cache BEFORE the first data load (main.ts awaits this function):
  // an offline reload shows the unsynced queue changes.
  await replayOutboxToCache()
  void refreshPendingCount()
  watch(isOffline, (offline) => {
    // After an explicit logout, autosync is not started until manual login
    if (!offline && shouldAutoSync() && !isLoggedOut()) void runSync()
  })
  if (!isOffline.value) {
    void refreshPendingCount().then(() => {
      if (shouldAutoSync() && !isLoggedOut() && pendingCount.value > 0) void runSync()
    })
  }
  // Periodic flushing & the PULL cycle live in offline/cycle.ts (10 s loop).
}

/**
 * Auto re-login for the desktop build (Electron).
 * If autosync is enabled, there is no session (tokens expired/missing) and the
 * safeStorage holds login+password — silently log in so autosync can
 * work without manual input. In the browser (no safeStorage) it does nothing.
 * After an explicit logout (mvs_erp_logged_out flag) it does not log in until manual login.
 */
export async function ensureDesktopAutoSyncSession(): Promise<void> {
  if (!isElectron || !shouldAutoSync()) return
  if (isLoggedOut()) return
  const auth = useAuthStore()
  // Session already alive — don't touch it.
  if (auth.isAuthenticated && !auth.accessExpired) return
  if (isOffline.value) return
  const creds = await getSyncCredentials()
  if (!creds?.login || !creds.password) return
  await auth.login(creds.login, creds.password)
}

/** Background session maintenance period (extending the access token with a silent login) */
const SESSION_MAINTENANCE_MS = 30 * 1000

let maintenanceTimer: number | null = null

/**
 * Background session maintenance in Desktop: every 30 s silently refresh the access
 * token with autosync credentials when it is about to expire (the refresh cookie does
 * not work cross-site, so we extend it by logging in). Idempotent: ensure... itself
 * filters out a fresh session, offline, and the "after logout" flag. An offline session
 * (login without network) automatically becomes real when the network returns.
 */
export function startSessionMaintenance(): void {
  if (!isElectron || maintenanceTimer != null) return
  maintenanceTimer = window.setInterval(() => {
    void ensureDesktopAutoSyncSession()
  }, SESSION_MAINTENANCE_MS)
}
