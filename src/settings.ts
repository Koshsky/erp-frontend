import { reactive, ref, watch } from 'vue'
import type { PlanningUnit } from './components/planner/calendar'

/**
 * Sync settings (the "Sync" screen). Stored in localStorage
 * under the mvs_erp_sync_* keys. Login/password are not stored here: the session
 * lives in the access token (in memory, AD-05) and the refresh token (IndexedDB,
 * offline/session.ts — sent in the body of /auth/refresh; the HttpOnly cookie is
 * only a legacy fallback). After a reload, restoration happens via /auth/refresh.
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
// ---------------------------------------------------------------------------
// View settings (the right pane of the "Settings" screen).
// Client-side, per-device (no persistence across devices), applied the next
// time a planning page is opened. No TTL — cleared only by explicit browser
// storage purge / local-storage reset of the user's choosing.
// ---------------------------------------------------------------------------


export const VIEW_SETTINGS_KEY = 'mvs_erp_view_settings'

export interface ViewSettings {
  /** Gantt badges: resource (specialization) on the task bars */
  badgeResource: boolean
  /** Gantt badge: the project code on bars */
  badgeProjectCode: boolean
  /** Gantt badge: "% of completed operations" on task bars */
  badgeProgress: boolean
  /** Gantt badges/labels: assignee on tasks, owner on process/project bars */
  badgeOwner: boolean
  /** Timeline unit the diagrams open in: day cells or decade cells */
  defaultUnit: PlanningUnit
  /** Initial table zoom (%) applied when a diagram is first opened in a session */
  defaultScale: number
  /** Initial cell width at open (% of the responsive base column width for the
   *  current window). 50–200%; 100 keeps the adaptive default (no fixed cell). */
  defaultCellZoom: number
  /** Whether the visible "Save to PDF / Print" toolbar buttons are shown */
  showPdfButtons: boolean
}

const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  badgeResource: true,
  badgeProjectCode: true,
  badgeProgress: true,
  badgeOwner: true,
  defaultUnit: 'day',
  defaultScale: 100,
  defaultCellZoom: 100,
  showPdfButtons: true,
}

function readViewSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(VIEW_SETTINGS_KEY)
    if (raw == null) return { ...DEFAULT_VIEW_SETTINGS }
    return { ...DEFAULT_VIEW_SETTINGS, ...(JSON.parse(raw) as Partial<ViewSettings>) }
  } catch {
    return { ...DEFAULT_VIEW_SETTINGS }
  }
}

/** Live view-settings state (mutation = applied on next page open). */
export const viewSettings = reactive<ViewSettings>(readViewSettings())

watch(
  viewSettings,
  () => saveViewSettings(),
  { deep: true },
)

/** Persists the current view settings. */
export function saveViewSettings(): void {
  try {
    localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(viewSettings))
  } catch {
    // not critical
  }
}

/** Default-scale range offered by the UI (%), matching useTimelineZoom bounds (0.5–2). */
export const SCALE_MIN = 50
export const SCALE_MAX = 200
export const SCALE_STEP = 5

/** Default cell-width zoom offered by the UI (%), centered on the responsive base. */
export const CELL_ZOOM_MIN = 50
export const CELL_ZOOM_MAX = 200
export const CELL_ZOOM_STEP = 5

/** Hard upper bound of the physical cell width in px (mirrors ZOOM_MAX in useTimelineZoom). */
export const MAX_CELL_PX = 100
