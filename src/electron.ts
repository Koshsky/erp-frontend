/**
 * Electron integration for the frontend.
 *
 * In the desktop wrapper (services/desktop) the renderer gets the
 * `window.erpDesktop` bridge via preload. This is the single place that
 * detects the environment and safely stores the password:
 *  - Electron: the main process stores the password via safeStorage (OS-level
 *    encryption, file in userData); the renderer has no access to the raw value.
 *  - Browser: safeStorage is unavailable, so the password is not stored at all
 *    (as before) — the methods return null/false.
 */

export const isElectron = Boolean(
  typeof window !== 'undefined' && window.erpDesktop?.isElectron === true,
)

/** Desktop app version (Electron), or null in the browser */
export async function desktopAppVersion(): Promise<{ version: string; electron: string } | null> {
  if (!isElectron || !window.erpDesktop) return null
  try {
    return await window.erpDesktop.appVersion()
  } catch {
    return null
  }
}

/**
 * Get the stored autosync password.
 * Electron only (safeStorage); always null in the browser.
 */
export async function getDesktopPassword(): Promise<string | null> {
  if (!isElectron || !window.erpDesktop) return null
  try {
    return await window.erpDesktop.password.get()
  } catch {
    return null
  }
}

/**
 * Whether the autosync password is stored (for the "credentials saved" UI status).
 * Always false in the browser.
 */
export async function hasDesktopPassword(): Promise<boolean> {
  const p = await getDesktopPassword()
  return Boolean(p && p.length > 0)
}

/**
 * Save/delete the autosync password.
 * In Electron — via safeStorage; in the browser always false (not supported).
 */
export async function setDesktopPassword(value: string): Promise<boolean> {
  if (!isElectron || !window.erpDesktop) return false
  try {
    return await window.erpDesktop.password.set(value)
  } catch {
    return false
  }
}

/** Delete the stored autosync password. */
export async function clearDesktopPassword(): Promise<boolean> {
  if (!isElectron || !window.erpDesktop) return false
  try {
    return await window.erpDesktop.password.clear()
  } catch {
    return false
  }
}
