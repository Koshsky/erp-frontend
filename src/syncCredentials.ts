/**
 * Хранение данных для автосинхронизации (логин + пароль).
 *
 *  - Логин (username) не секретен — хранится в localStorage.
 *  - Пароль секретен — в Electron хранится только в safeStorage
 *    (шифрование на уровне ОС, доступ через main-процесс: файл в userData);
 *    в обычном браузере пароль не хранится вовсе.
 *
 * Схема пары: `{ login, password }`, где password === null означает «пароль
 * не сохранён» (например, в браузере). Авторелогin возможен только когда
 * есть и логин, и пароль.
 */

import { getDesktopPassword, setDesktopPassword, clearDesktopPassword, isElectron } from './electron'

const LOGIN_KEY = 'mvs_erp_sync_login'

/** Сохранённый логин (localStorage), либо null */
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
    // настройки не критичны
  }
}

/** Пароль из safeStorage (Electron) или null (браузер / не сохранён) */
export async function getSavedPassword(): Promise<string | null> {
  if (!isElectron) return null
  return getDesktopPassword()
}

export interface SyncCredentials {
  login: string
  password: string | null
}

/** Полные сохранённые креды для авторелогina ({ password: null } — нельзя автовойти) */
export async function getSyncCredentials(): Promise<SyncCredentials | null> {
  const login = getSavedLogin()
  if (!login) return null
  const password = await getSavedPassword()
  return { login, password }
}

/**
 * Сохранить логин и пароль.
 * Логин — всегда; пароль — только в Electron (safeStorage). Возвращает true,
 * если пара полна (можно авторелогin).
 */
export async function saveSyncCredentials(login: string, password: string): Promise<boolean> {
  setSavedLogin(login.trim() || null)
  if (!isElectron) return false
  await setDesktopPassword(password)
  return Boolean(login.trim() && password)
}

/** Очистить сохранённые логин и пароль */
export async function clearSyncCredentials(): Promise<void> {
  setSavedLogin(null)
  if (isElectron) await clearDesktopPassword()
}

/** Есть ли сохранённый логин (показываем подсказку на экране) */
export function hasSavedLogin(): boolean {
  return getSavedLogin() != null
}

/** Пароль хранится безопасно (Electron) или не хранится вовсе (браузер) */
export function passwordStorageLabel(): string {
  return isElectron ? 'Хранится в защищённом хранилище ОС (safeStorage)' : 'Не хранится в браузере'
}
