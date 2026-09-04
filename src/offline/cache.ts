import { idbClear, idbGet, idbKeys, idbPut } from './db'

const CACHE_STORE = 'cache'
/** Marker entry storing the app version the current cache was written with */
const VERSION_KEY = 'meta:app-version'

/**
 * Cache of API responses in IndexedDB. The key is the full URL of the GET
 * request (axios.getUri).
 *
 * Rendering is LOCAL-FIRST: pages always read the cache (via hydrateFromCache),
 * and the network is used only by the background PULL cycle (which writes fresh
 * responses here) and by mutations. No TTL is enforced on reads — stale data
 * is better than nothing; freshness is surfaced in the UI (cacheGetFresh).
 */

export interface CachedEntry<T> {
  ts: number
  /** App version the entry was written by (for cache invalidation on upgrade) */
  version?: string
  data: T
}

/** The app version at runtime (vite define, also in main.ts) */
function appVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
}

export async function cachePut<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CachedEntry<T> = { ts: Date.now(), version: appVersion(), data }
    await idbPut(CACHE_STORE, key, entry)
  } catch {
    // The cache is not a critical layer: write errors are ignored
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const entry = await idbGet<CachedEntry<T>>(CACHE_STORE, key)
    return entry?.data ?? null
  } catch {
    return null
  }
}

function pathnameOf(key: string): string | null {
  try {
    return new URL(key).pathname
  } catch {
    // relative key (no base) — take everything up to '?', as in cacheApply
    return key.split('?')[0]
  }
}

/**
 * Returns the freshest cached response by pathname (endpoint), ignoring
 * query parameters. Needed for GETs with date windows (calendar, timesheet, absences)
 * whose full URL depends on "today" and after replay differs from the
 * warmed one: the exact key does not match, but the endpoint data is in the cache.
 *
 * `keyPredicate` narrows the match when the same pathname is shared by several
 * queries (e.g. /user with different role/limit params): only keys satisfying
 * it are considered.
 */
export async function cacheGetByPath<T>(
  pathname: string,
  keyPredicate?: (key: string) => boolean,
): Promise<T | null> {
  try {
    const keys = await idbKeys(CACHE_STORE)
    let best: { ts: number; data: T } | null = null
    for (const key of keys) {
      if (pathnameOf(key) !== pathname) continue
      if (keyPredicate && !keyPredicate(key)) continue
      const entry = await idbGet<CachedEntry<T>>(CACHE_STORE, key)
      if (!entry) continue
      if (!best || entry.ts > best.ts) best = { ts: entry.ts, data: entry.data }
    }
    return best ? best.data : null
  } catch {
    return null
  }
}

/** Cached value together with its write time (for the freshness UX) */
export interface FreshEntry<T> {
  data: T
  ts: number
}

export async function cacheGetFresh<T>(
  pathname: string,
  keyPredicate?: (key: string) => boolean,
): Promise<FreshEntry<T> | null> {
  try {
    const keys = await idbKeys(CACHE_STORE)
    let best: FreshEntry<T> | null = null
    for (const key of keys) {
      if (pathnameOf(key) !== pathname) continue
      if (keyPredicate && !keyPredicate(key)) continue
      const entry = await idbGet<CachedEntry<T>>(CACHE_STORE, key)
      if (!entry) continue
      if (!best || entry.ts > best.ts) best = { data: entry.data, ts: entry.ts }
    }
    return best
  } catch {
    return null
  }
}

/**
 * Clears the GET cache when the app version changed (format/schema of cached
 * payloads may differ between releases). The mutation queue (outbox) is NOT
 * touched — unsynced changes must never be lost. Called at desktop startup.
 */
export async function ensureCacheVersion(): Promise<void> {
  const version = appVersion()
  if (!version) return
  try {
    const stored = await idbGet<{ v: string }>(CACHE_STORE, VERSION_KEY)
    if (stored && stored.v === version) return
    await idbClear(CACHE_STORE)
    await idbPut(CACHE_STORE, VERSION_KEY, { v: version })
  } catch {
    // cache is not critical — ignore
  }
}