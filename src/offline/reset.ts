import { useAuthStore } from '@/store'
import { clearOutbox } from './outbox'

const DB_NAME = 'erp-offline'

function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

/**
 * Полный сброс локальных данных: токены + очередь outbox + кэш данных
 * (IndexedDB). После очистки перезагружаем приложение — удалённую БД создаёт
 * заново первый вызов db.ts, а стора/прочее получают чистое состояние.
 */
export async function clearLocalData(): Promise<void> {
  await clearOutbox().catch(() => {})
  useAuthStore().logout()
  await deleteDb()
  window.location.reload()
}