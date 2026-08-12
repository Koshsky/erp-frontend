/**
 * Минимальная promise-обёртка над IndexedDB (без внешних зависимостей).
 * Одна БД `erp-offline` со стораджем `cache` для кэширования ответов API.
 */

const DB_NAME = 'erp-offline'
const DB_VERSION = 1
const CACHE_STORE = 'cache'

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

export async function idbPut(key: string, value: unknown): Promise<void> {
  await txAll(CACHE_STORE, 'readwrite', (s) => s.put(value, key))
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const result = await txAll(CACHE_STORE, 'readonly', (s) => s.get(key))
  return result as T | undefined
}

export async function idbDel(key: string): Promise<void> {
  await txAll(CACHE_STORE, 'readwrite', (s) => s.delete(key))
}
