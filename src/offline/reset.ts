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
 * Full reset of local data: tokens + outbox queue + data cache (IndexedDB).
 * After clearing we reload the app — the first db.ts call recreates the
 * deleted database, and stores/other state start clean.
 */
export async function clearLocalData(): Promise<void> {
  await clearOutbox().catch(() => {})
  useAuthStore().logout()
  await deleteDb()
  window.location.reload()
}