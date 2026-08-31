import { ref } from 'vue'

/**
 * Sync settings (the "Sync" screen). Stored in localStorage
 * under the mvs_erp_sync_* keys. Login/password are not stored here: the session
 * lives in the access token (in memory, AD-05) and the HttpOnly refresh cookie; after
 * a reload, restoration happens via /auth/refresh.
 */

const AUTO_SYNC_KEY = 'mvs_erp_auto_sync'

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : raw === '1'
  } catch {
    return fallback
  }
}

/** Auto-sync: PUSH at startup and when the network returns */
export const autoSync = ref(readBool(AUTO_SYNC_KEY, true))

/** Saves the current setting values to localStorage */
export function saveSyncSettings(): void {
  try {
    localStorage.setItem(AUTO_SYNC_KEY, autoSync.value ? '1' : '0')
  } catch {
    // settings are not critical
  }
}

/** Reactive auto-sync check (for sync.ts, read on the fly) */
export function shouldAutoSync(): boolean {
  return autoSync.value
}