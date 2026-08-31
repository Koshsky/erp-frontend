/**
 * Minimal promise wrapper over IndexedDB (no external dependencies).
 * A single `erp-offline` database with stores:
 *  - `cache`  — API response cache (GET);
 *  - `outbox` — mutation queue for offline writes (create/update/delete);
 *  - `idmap`  — persistent mapping of temporary (negative) ids of created
 *    offline entities to real ids, so dependent records are sent with the
 *    real id (not a fake one) after sync interruptions.
 */

const DB_NAME = 'erp-offline'
const DB_VERSION = 3
const CACHE_STORE = 'cache'
const OUTBOX_STORE = 'outbox'
const IDMAP_STORE = 'idmap'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE)
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE)
      }
      if (!db.objectStoreNames.contains(IDMAP_STORE)) {
        db.createObjectStore(IDMAP_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Не удалось открыть IndexedDB'))
  })
}

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb().catch((e) => {
      dbPromise = null
      throw e
    })
  }
  return dbPromise
}

function txAll(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<IDBRequest['result']> {
  return new Promise((resolve, reject) => {
    getDb()
      .then((db) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result)
        tx.onabort = () => reject(tx.error)
        tx.onerror = () => reject(tx.error)
        req.onerror = () => reject(req.error)
      })
      .catch(reject)
  })
}

export async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  await txAll(store, 'readwrite', (s) => s.put(value, key))
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const result = await txAll(store, 'readonly', (s) => s.get(key))
  return result as T | undefined
}

export async function idbDel(store: string, key: string): Promise<void> {
  await txAll(store, 'readwrite', (s) => s.delete(key))
}

export async function idbAll<T>(store: string): Promise<T[]> {
  const result = await txAll(store, 'readonly', (s) => s.getAll())
  return (result ?? []) as T[]
}

export async function idbKeys(store: string): Promise<string[]> {
  const result = await txAll(store, 'readonly', (s) => s.getAllKeys())
  return (result ?? []) as string[]
}

export async function idbCount(store: string): Promise<number> {
  const result = await txAll(store, 'readonly', (s) => s.count())
  return typeof result === 'number' ? result : 0
}

export const IDMAP_STORE_NAME = IDMAP_STORE

/** Mapping of a temporary (negative) offline-creation id to the real server id */
export interface IdMapEntry {
  temp: number
  real: number
}
