import { ref, watch } from 'vue'
import { isElectron } from '@/electron'
import { isOffline, probeBackend } from './state'
import { syncNow } from './sync'
import { pullStaleCycle, scheduleWarmup } from './warmup'
import { shouldAutoSync } from '@/settings'
import { isLoggedOut } from '@/loggedOut'

/**
 * The single background maintenance cycle of the offline-first desktop UX.
 *
 * Every CYCLE_MS (10 s, per the offline UX spec) it:
 *   1. probes the backend (and updates isOffline);
 *   2. if online — PUSH: flushes the mutation queue (runSync: outbox + reconcile);
 *   3. if online — PULL: refreshes only cache domains that went stale (TTL),
 *      no constant unnecessary GETs (warmup.ts pullStaleCycle).
 *
 * The cycle runs only while the window is visible, autosync is enabled and the
 * user has not logged out; it replaces the old separate probe/push/rewarm timers.
 *
 * On network return the full warmup still runs immediately (watch below).
 */

const CYCLE_MS = 10 * 1000

const LAST_PULL_KEY = 'mvs_erp_last_pull_at'

function readLastPull(): number | null {
  try {
    const raw = localStorage.getItem(LAST_PULL_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** Time of the last successful background PULL (for the freshness chip) */
export const lastPullAt = ref<number | null>(readLastPull())

function notePull(): void {
  const now = Date.now()
  lastPullAt.value = now
  try {
    localStorage.setItem(LAST_PULL_KEY, String(now))
  } catch {
    // not critical
  }
}

let cycleTimer: number | null = null

/** Run in the background, no matter which await settles first */
async function tick(): Promise<void> {
  if (document.hidden) return // no requests from a minimized/hidden window
  if (!shouldAutoSync() || isLoggedOut()) return

  const reachable = await probeBackend()
  isOffline.value = !reachable

  if (!reachable) return

  // PUSH: mutations first (server truth wins afterwards)
  await syncNow()
  // PULL: stale domains only
  const refreshed = await pullStaleCycle()
  if (refreshed > 0) notePull()
}

/** Starts the 10-second maintenance cycle (desktop only, idempotent). */
export function startOfflineCycle(): void {
  if (!isElectron || cycleTimer != null) return
  void tick()
  cycleTimer = window.setInterval(() => {
    void tick()
  }, CYCLE_MS)
}

if (isElectron && typeof window !== 'undefined') {
  // Network return → immediate full warmup (fresh data as soon as it appears)
  watch(isOffline, (offline) => {
    if (!offline) scheduleWarmup()
  })
}