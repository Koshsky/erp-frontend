/**
 * Electron-интеграция фронтенда.
 *
 * В настольной обвязке (services/desktop) renderer получает мост
 * `window.erpDesktop` через preload. Здесь — единая точка определения
 * окружения и безопасного хранения пароля:
 *  - Electron: пароль хранит main-процесс через safeStorage (шифрование на
 *    уровне ОС, файл в userData); renderer к сырому значению не имеет доступа.
 *  - Браузер: safeStorage недоступен, поэтому пароль не храним вовсе
 *    (как раньше) — методы возвращают null/false.
 */

export const isElectron = Boolean(
  typeof window !== 'undefined' && window.erpDesktop?.isElectron === true,
)

/** Версия настольного приложения (Electron), либо null в браузере */
export async function desktopAppVersion(): Promise<{ version: string; electron: string } | null> {
  if (!isElectron || !window.erpDesktop) return null
  try {
    return await window.erpDesktop.appVersion()
  } catch {
    return null
  }
}

/**
 * Получить сохранённый пароль автосинка.
 * Только Electron (safeStorage); в браузере всегда null.
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
 * Сохранить/удалить пароль автосинка.
 * В Electron — через safeStorage; в браузере всегда false (не умеем).
 */
export async function setDesktopPassword(value: string): Promise<boolean> {
  if (!isElectron || !window.erpDesktop) return false
  try {
    return await window.erpDesktop.password.set(value)
  } catch {
    return false
  }
}

/** Удалить сохранённый пароль автосинка. */
export async function clearDesktopPassword(): Promise<boolean> {
  if (!isElectron || !window.erpDesktop) return false
  try {
    return await window.erpDesktop.password.clear()
  } catch {
    return false
  }
}
