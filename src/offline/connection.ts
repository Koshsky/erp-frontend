import { ref, watch } from 'vue'
import { isOffline, probeBackend, reconnectCountdown } from './state'
import { syncNow } from './sync'
import { pullStaleCycle, scheduleWarmup } from './warmup'
import { pendingCount, refreshPendingCount } from './outbox'
import { shouldAutoSync } from '@/settings'
import { isLoggedOut } from '@/loggedOut'

/**
 * The single background connection & maintenance monitor, active in EVERY
 * environment (web and desktop) and idempotent — starting it twice is a no-op.
 *
 * It watches backend reachability and drives autosync:
 *   - ONLINE: probes /health every ONLINE_PROBE_MS (2 s); while the connection
 *     is healthy it auto-pushes the mutation queue every AUTO_PUSH_MS (5 s,
 *     only when there are pending entries) and refreshes stale cache domains on
 *     a slower PULL timer.
 *   - OFFLINE (a probe fails): flips isOffline and starts a reconnect countdown
 *     (reconnectCountdown, 60 → 0, one tick per second). On 0 it probes again;
 *     success returns online and immediately flushes the queue + warms up.
 *   - The window `online`/`offline` events switch state immediately, without
 *     waiting for the next timed probe.
 *
 * The monitor never polls a hidden tab and stops all scheduled work when
 * autosync is off or the user has explicitly logged out (same guards as the
 * old cycle.ts it replaces).
 */

const ONLINE_PROBE_MS = 2000 // heartbeat probe while the connection is up
const AUTO_PUSH_MS = 5000 // auto-push of the pending queue while online
const PULL_STALE_MS = 60 * 1000 // slow PULL refresher (stale cache domains only)
const OFFLINE_RETRY_MS = 60 // reconnect attempt interval (seconds)
const COUNTDOWN_TICK_MS = 1000 // one countdown step per second

/** Guards against double-starting the monitor (idempotent) */
let started = false

/** Guards against overlapping auto-push/recovery while a flush is in flight */
let pushing = false
let recovering = false

/**
 * Background PULL freshness marker (survives reloads via localStorage).
 * Owned here so imports from the deprecated './cycle' still resolve (cycle.ts).
 */
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

/** Whether scheduled work may run right now (visible tab + user not signed out) */
function canWork(): boolean {
  if (document.hidden) return false
  if (!shouldAutoSync() || isLoggedOut()) return false
  return true
}

let heartbeatTimer: number | null = null
let autoPushTimer: number | null = null
let pullTimer: number | null = null
let countdownTimer: number | null = null

function stopOnlineLoop(): void {
  if (heartbeatTimer != null) window.clearInterval(heartbeatTimer)
  if (autoPushTimer != null) window.clearInterval(autoPushTimer)
  if (pullTimer != null) window.clearInterval(pullTimer)
  heartbeatTimer = null
  autoPushTimer = null
  pullTimer = null
}

function stopCountdown(): void {
  if (countdownTimer != null) window.clearInterval(countdownTimer)
  countdownTimer = null
}

function startOnlineLoop(): void {
  stopOnlineLoop()
  heartbeatTimer = window.setInterval(() => void onlineHeartbeat(), ONLINE_PROBE_MS)
  autoPushTimer = window.setInterval(() => void autoPush(), AUTO_PUSH_MS)
  pullTimer = window.setInterval(() => void stalePull(), PULL_STALE_MS)
}

function startCountdown(): void {
  stopCountdown()
  countdownTimer = window.setInterval(() => countdownTick(), COUNTDOWN_TICK_MS)
}

/** The connection dropped: flip offline and begin the reconnect countdown. */
function gotoOffline(): void {
  if (isOffline.value) return // already offline & counting down
  stopOnlineLoop()
  isOffline.value = true
  reconnectCountdown.value = OFFLINE_RETRY_MS
  startCountdown()
}

/** Backend confirmed reachable: go online, flush the queue and warm up. */
async function handleBackendUp(): Promise<void> {
  if (!isOffline.value) return
  if (recovering) return
  recovering = true
  try {
    stopCountdown()
    isOffline.value = false
    reconnectCountdown.value = null
    startOnlineLoop()
    if (canWork() && pendingCount.value > 0) await syncNow()
    // Cover data not reached by the slow PULL loop right after re-connects.
    scheduleWarmup()
  } finally {
    recovering = false
  }
}

/** A single online heartbeat probe → offline when it fails. */
async function onlineHeartbeat(): Promise<void> {
  if (!canWork()) return
  const alive = await probeBackend()
  if (!alive) gotoOffline()
}

/** Auto-push queued mutations while online (only when the queue is non-empty). */
async function autoPush(): Promise<void> {
  if (pushing || isOffline.value || !canWork()) return
  if (pendingCount.value <= 0) return
  pushing = true
  try {
    await syncNow() // runSync flushes the outbox + reconciles + raises the notice
    await refreshPendingCount()
  } finally {
    pushing = false
  }
}

/** Slow PULL of expired cache domains (keeps the cache fresh when online). */
async function stalePull(): Promise<void> {
  if (isOffline.value || !canWork()) return
  const refreshed = await pullStaleCycle()
  if (refreshed > 0) notePull()
}

/** One reconnect-countdown step; on zero, probe again. */
function countdownTick(): void {
  if (document.hidden) return
  if (reconnectCountdown.value == null) return
  if (reconnectCountdown.value > 0) {
    reconnectCountdown.value -= 1
  } else {
    void retryConnectionNow()
  }
}

/**
 * Immediate reconnect attempt — the "Повторить" action. Probes the backend now
 * instead of waiting for the countdown to reach zero. A success goes back
 * online right away; a failure restarts a full countdown.
 */
export async function retryConnectionNow(): Promise<void> {
  if (recovering) return
  // Reset the countdown so it reads as "currently probing" while we wait.
  if (reconnectCountdown.value != null) reconnectCountdown.value = 0
  const alive = await probeBackend()
  if (alive) {
    await handleBackendUp()
  } else if (!isOffline.value) {
    // Lost connection between probes — enter offline + countdown.
    gotoOffline()
  } else {
    reconnectCountdown.value = OFFLINE_RETRY_MS
  }
}

function onWindowOffline(): void {
  // The browser has no network → the backend is unreachable right away.
  gotoOffline()
}

function onWindowOnline(): void {
  // The network interface is back but the backend may still be down: only the
  // probe decides. Probe immediately instead of on the next scheduled tick.
  if (reconnectCountdown.value != null) {
    void retryConnectionNow()
  } else {
    void onlineHeartbeat()
  }
}

/**
 * Starts the background connection monitor. Called from main.ts for every
 * environment. Idempotent — a second call keeps the already-running monitor.
 */
export function startConnectionMonitor(): void {
  if (started || typeof window === 'undefined') return
  started = true

  // navigator.onLine reported offline at init → start the reconnect flow.
  if (isOffline.value) {
    gotoOffline()
  } else {
    startOnlineLoop()
  }

  window.addEventListener('online', onWindowOnline)
  window.addEventListener('offline', onWindowOffline)

  // Network return → an idle-time full warmup for data the slow PULL misses
  // (scheduleWarmup no-ops when already online / queue already flushed above).
  watch(isOffline, (offline) => {
    if (!offline) scheduleWarmup()
  })
}
