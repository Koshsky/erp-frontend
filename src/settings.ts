import { ref } from 'vue'

/**
 * Настройки синхронизации (экран «Синхронизация»). Хранятся в localStorage
 * под ключами mvs_erp_sync_*. Логин/пароль здесь не хранятся: сессия живёт
 * в токенах (mvs_erp_access/refresh_token) и переживает офлайн-перезапуск.
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

/** Автосинхронизация: PUSH при запуске и при возврате сети */
export const autoSync = ref(readBool(AUTO_SYNC_KEY, true))

/** Сохраняет текущие значения настроек в localStorage */
export function saveSyncSettings(): void {
  try {
    localStorage.setItem(AUTO_SYNC_KEY, autoSync.value ? '1' : '0')
  } catch {
    // настройки не критичны
  }
}

/** Реактивная проверка автосинхронизации (для sync.ts, читается «на лету») */
export function shouldAutoSync(): boolean {
  return autoSync.value
}