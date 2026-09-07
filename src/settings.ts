import { reactive, ref } from 'vue'

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

// ---------------------------------------------------------------------------
// Per-domain warm-up toggles ("Какие данные прогревать").
// Each warm-up domain defaults to enabled; a domain the user switched off is
// persisted under mvs_erp_warmup_<name> as '0'. The warm-up loop (warmup.ts)
// reads warmupEnabled[stepName] and skips a step whose value is false.
// ---------------------------------------------------------------------------

const WARMUP_KEY_PREFIX = 'mvs_erp_warmup_'

function readWarmupFlag(name: string): boolean {
  try {
    const raw = localStorage.getItem(WARMUP_KEY_PREFIX + name)
    return raw == null ? true : raw === '1'
  } catch {
    // storage unavailable — default to enabled
    return true
  }
}

/** Explicit (user-overridden) toggles, used as the write-through backing store */
const warmupToggles = reactive<Record<string, boolean>>({})

/**
 * Reactive per-domain warm-up switches. Reading a domain that has no explicit
 * toggle falls back to the persisted value (default enabled). Assigning a value
 * records it so the setting survives reloads.
 */
export const warmupEnabled = new Proxy<Record<string, boolean>>(warmupToggles, {
  get(target, prop) {
    if (typeof prop === 'string' && prop in target) return target[prop]
    if (typeof prop === 'string') return readWarmupFlag(prop)
    return undefined
  },
  set(target, prop, value) {
    if (typeof prop === 'string') target[prop] = value as boolean
    return true
  },
})

/** Effective enabled state for a domain (defaults to enabled). */
export function getWarmupStep(name: string): boolean {
  return warmupEnabled[name]
}

/** Flips a domain's warm-up toggle and persists. */
export function toggleWarmupStep(name: string): void {
  warmupEnabled[name] = !getWarmupStep(name)
  saveWarmupSettings()
}

/** Persists the current warm-up toggles to localStorage. */
export function saveWarmupSettings(): void {
  try {
    for (const [name, enabled] of Object.entries(warmupToggles)) {
      localStorage.setItem(WARMUP_KEY_PREFIX + name, enabled ? '1' : '0')
    }
  } catch {
    // settings are not critical
  }
}