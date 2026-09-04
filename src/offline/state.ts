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

const PROBE_TIMEOUT_MS = 4000

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

// Backend availability is monitored by the single 10-second maintenance
// cycle (offline/cycle.ts), which probes /health and flips isOffline.
