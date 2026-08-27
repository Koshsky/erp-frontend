/**
 * Флаг «вышел из системы» (localStorage): после явного выхода автосинк
 * (тихий re-login и вход при старте) не выполняется, пока пользователь
 * не войдёт вручную онлайн. Офлайн-вход по кнопке (LoginPage) — явное
 * действие пользователя, флаг не трогает.
 */

const LOGGED_OUT_KEY = 'mvs_erp_logged_out'

/** Стоит ли флаг «пользователь вышел и ещё не входил вручную» */
export function isLoggedOut(): boolean {
  try {
    return localStorage.getItem(LOGGED_OUT_KEY) === '1'
  } catch {
    return false
  }
}

/** Снять флаг — только при успешном ручном онлайн-входе */
export function clearLoggedOut(): void {
  try {
    localStorage.removeItem(LOGGED_OUT_KEY)
  } catch {
    // флаг не критичен
  }
}

/** Установить флаг — при явном выходе (logout) */
export function setLoggedOut(): void {
  try {
    localStorage.setItem(LOGGED_OUT_KEY, '1')
  } catch {
    // флаг не критичен
  }
}