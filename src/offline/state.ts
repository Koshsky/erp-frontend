import { ref } from 'vue'
import type { Ref } from 'vue'
import { isElectron } from '@/electron'
import { getApiUrl } from '@/config'

/**
 * Reactive network state. Updated by window online/offline events and a
 * background API ping (startConnectivityMonitor). Used so that being offline
 * does not bounce the user to /login (token refresh) and for the "offline mode" banner.
 *
 * Offline mode exists ONLY in the desktop (Electron) build. On the web the
 * frontend is considered strictly online: isOffline is always false, the monitor and
 * window listeners are not activated.
 */
export const isOffline: Ref<boolean> = ref(
  isElectron && typeof navigator !== 'undefined' && navigator.onLine === false,
)

if (isElectron && typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOffline.value = false
  })
  window.addEventListener('offline', () => {
    isOffline.value = true
  })
}

const PROBE_INTERVAL_MS = 15000
const PROBE_TIMEOUT_MS = 4000
let probeTimer: number | null = null
let probed = false

/** Liveness probe URL: the real backend endpoint /api/v1/health. */
function probeUrl(): string | null {
  const base = getApiUrl()
  return base ? `${base.replace(/\/+$/, '')}/health` : null
}

/** Whether the backend is alive: any status <500 = reachable, network error/5xx = not */
export async function probeBackend(): Promise<boolean> {
  const url = probeUrl()
  if (!url) return false
  try {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal })
      return res.status < 500
    } finally {
      window.clearTimeout(timer)
    }
  } catch {
    return false
  }
}

/**
 * Background monitoring of backend availability. navigator.onLine lies ("dead
 * WiFi"), and with warmed data no API requests are made — the http interceptor
 * does not fire and isOffline stays false. So we periodically ping the
 * real endpoint /api/v1/health so the orange offline banner stays up
 * while the backend is unreachable (even when the cache is warmed).
 */
export function startConnectivityMonitor(): void {
  // The web build has no offline mode — don't start the monitor.
  if (!isElectron) return
  if (probeTimer != null) return
  const tick = () => {
    void probeBackend().then((reachable) => {
      const wasOffline = isOffline.value
      isOffline.value = !reachable
      // Log only the first result — to verify the monitor works.
      if (!probed) {
        probed = true
        console.log(`[offline] probe: reachable=${reachable} → isOffline=${isOffline.value}`)
      }
    })
  }
  tick()
  probeTimer = window.setInterval(tick, PROBE_INTERVAL_MS)
}
