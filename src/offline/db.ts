/**
 * Minimal promise wrapper over IndexedDB (no external dependencies).
 * A single `erp-offline` database with stores:
 *  - `cache`  — API response cache (GET);
 *  - `outbox` — mutation queue for offline writes (create/update/delete);
 *  - `idmap`  — persistent mapping of temporary (negative) ids of created
 *    offline entities to real ids, so dependent records are sent with the
 *    real id (not a fake one) after sync interruptions.
 *  - `session` — the single non-volatile refresh token store (for all
 *    environments: web + desktop), the "remember me" for auto-session.
 *
 * NO-TTL INVARIANT: the local stores (cache/outbox/idmap/session) have no
 * TTL and are never cleaned up by time/age/timers. Data is removed only by:
 *  - explicit user actions (clearLocalData / clearOutbox, discardFailed /
 *    discardEntry for rejected queue entries);
 *  - an app-version change (ensureCacheVersion — clears ONLY the cache);
 *  - a verified online login pruning the queue entries of the logged-out
 *    previous account (their session is revoked and the flush-time creator
 *    guard would park them forever); logout itself no longer wipes the queue
 *    (a sibling tab of the same user loses its pending work — see H-OFF-3).
 * Server-side TTLs (refresh session 168h, access token 15m) are validated only
 * by the backend. See docs/no-ttl-local-storage.md.
 */

const DB_NAME = 'erp-offline'
// The schema version this build knows. It is NOT passed to indexedDB.open
// directly: an existing database (created by an older bundle or bumped by our
// own store repair) may already be above it, and requesting a lower version
// fails with a VersionError. openDb() opens at the current version and only
// bumps when an object store is missing.
const DB_VERSION = 4
const CACHE_STORE = 'cache'
const OUTBOX_STORE = 'outbox'
const IDMAP_STORE = 'idmap'
const SESSION_STORE = 'session'

/** Every object store the app relies on (must all exist after openDb). */
const ALL_STORES = [CACHE_STORE, OUTBOX_STORE, IDMAP_STORE, SESSION_STORE] as const

let dbPromise: Promise<IDBDatabase> | null = null

/** Creates any missing object store (runs inside onupgradeneeded). */
function ensureStores(db: IDBDatabase): void {
  for (const name of ALL_STORES) {
    if (!db.objectStoreNames.contains(name)) {
      db.createObjectStore(name)
    }
  }
}

/** Whether the connection has every required object store. */
function hasAllStores(db: IDBDatabase): boolean {
  return ALL_STORES.every((name) => db.objectStoreNames.contains(name))
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен'))
      return
    }

    // Open WITHOUT requesting a fixed version: a database created by an older
    // bundle (or by our own repair bump) may already sit above DB_VERSION, and
    // indexedDB.open(name, version) then fails with VersionError ("the stored
    // database is a higher version than the version requested"). Opening at
    // the current version never errors; missing stores are added below via a
    // version bump only when actually needed.
    const open = indexedDB.open(DB_NAME)
    open.onupgradeneeded = () => ensureStores(open.result)
    open.onblocked = () => {
      console.warn('[db] open blocked by an older connection in another tab — retrying')
    }
    open.onerror = () => reject(open.error ?? new Error('Не удалось открыть IndexedDB'))
    open.onsuccess = () => {
      const db = open.result
      // Close this connection when the database is upgraded by another tab —
      // an open connection of the old version would block their version bump.
      // Drop the cached handle so the next access reopens the new version.
      db.onversionchange = () => {
        resetDb()
        db.close()
      }
      if (hasAllStores(db)) {
        resolve(db)
        return
      }

      // Self-healing: the existing database is missing one of the required
      // object stores (e.g. a database created by an older bundle before the
      // session store was added). Bump the version one step above the current
      // one so the upgrade handler runs and creates the missing stores.
      const repairedVersion = db.version + 1
      console.warn(
        `[db] missing object store(s), repairing (version ${db.version} → ${repairedVersion})`,
      )
      db.close()

      const repair = indexedDB.open(DB_NAME, repairedVersion)
      repair.onupgradeneeded = () => ensureStores(repair.result)
      repair.onblocked = () => {
        console.warn('[db] repair blocked by an older connection in another tab — retrying')
      }
      repair.onerror = () => reject(repair.error ?? new Error('Не удалось восстановить IndexedDB'))
      repair.onsuccess = () => {
        const repaired = repair.result
        // Same cross-tab rule: close on an external version bump.
        repaired.onversionchange = () => {
          resetDb()
          repaired.close()
        }
        resolve(repaired)
      }
    }
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

/** Drop the cached connection (used after a close/version change) so the next
 *  call reopens the database. */
function resetDb(): void {
  dbPromise = null
}

/**
 * Closes the cached IndexedDB connection so that indexedDB.deleteDatabase can
 * proceed — any open connection (including this tab's own) blocks the deletion
 * (H-OFF-2). Safe when nothing is open: resolves immediately. The cached
 * handle is dropped; the next idb* call reopens the database.
 */
export async function closeDb(): Promise<void> {
  const db = dbPromise ? await dbPromise.catch(() => undefined) : undefined
  if (db) db.close()
  resetDb()
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

export async function idbClear(store: string): Promise<void> {
  await txAll(store, 'readwrite', (s) => s.clear())
}

export const IDMAP_STORE_NAME = IDMAP_STORE

/** Mapping of a temporary (negative) offline-creation id to the real server id */
export interface IdMapEntry {
  temp: number
  real: number
}
