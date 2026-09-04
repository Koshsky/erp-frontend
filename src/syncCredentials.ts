/**
 * Storage of auto-sync data (login + password).
 *
 *  - Login (username) is not secret — stored in localStorage.
 *  - Password is secret — in Electron it is stored only in safeStorage
 *    (OS-level encryption, accessed via the main process: a file in userData);
 *    in a regular browser the password is not stored at all.
 *
 * Pair schema: `{ login, password }`, where password === null means "password
 * not saved" (e.g. in the browser). Auto re-login is possible only when
 * both login and password are present.
 */

import { getDesktopPassword, setDesktopPassword, clearDesktopPassword, isElectron } from './electron'

const LOGIN_KEY = 'mvs_erp_sync_login'

/** Saved login (localStorage), or null */
export function getSavedLogin(): string | null {
  try {
    return localStorage.getItem(LOGIN_KEY)
  } catch {
    return null
  }
}

function setSavedLogin(login: string | null): void {
  try {
    if (login) localStorage.setItem(LOGIN_KEY, login)
    else localStorage.removeItem(LOGIN_KEY)
  } catch {
    // settings are not critical
  }
}

/** Password from safeStorage (Electron) or null (browser / not saved) */
export async function getSavedPassword(): Promise<string | null> {
  if (!isElectron) return null
  return getDesktopPassword()
}

export interface SyncCredentials {
  login: string
  password: string | null
}

/** Full saved credentials for auto re-login ({ password: null } — cannot auto-login) */
export async function getSyncCredentials(): Promise<SyncCredentials | null> {
  const login = getSavedLogin()
  if (!login) return null
  const password = await getSavedPassword()
  return { login, password }
}

/**
 * Save login and password.
 * Login — always; password — only in Electron (safeStorage). Returns true
 * if the pair is complete (auto re-login is possible).
 */
export async function saveSyncCredentials(login: string, password: string): Promise<boolean> {
  setSavedLogin(login.trim() || null)
  if (!isElectron) return false
  await setDesktopPassword(password)
  return Boolean(login.trim() && password)
}

/** Clear the saved login and password */
export async function clearSyncCredentials(): Promise<void> {
  setSavedLogin(null)
  if (isElectron) await clearDesktopPassword()
}

/** Whether a saved login exists (to show the hint on screen) */
export function hasSavedLogin(): boolean {
  return getSavedLogin() != null
}

/** Password is stored securely (Electron) or not stored at all (browser) */
export function passwordStorageLabel(): string {
  return isElectron ? 'Хранится в защищённом хранилище ОС (safeStorage)' : 'Не хранится в браузере'
}
