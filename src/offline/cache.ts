import { idbGet, idbKeys, idbPut } from './db'

const CACHE_STORE = 'cache'

/**
 * Cache of API responses in IndexedDB. The key is the full URL of the GET request (axios.getUri).
 * Online never reads the cache (network-first); it is only used as a
 * fallback when the network is unavailable, so no TTL is applied — stale
 * data is better than nothing.
 */

export interface CachedEntry<T> {
  ts: number
  data: T
}

export async function cachePut<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CachedEntry<T> = { ts: Date.now(), data }
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
 */
export async function cacheGetByPath<T>(pathname: string): Promise<T | null> {
  try {
    const keys = await idbKeys(CACHE_STORE)
    let best: { ts: number; data: T } | null = null
    for (const key of keys) {
      if (pathnameOf(key) !== pathname) continue
      const entry = await idbGet<CachedEntry<T>>(CACHE_STORE, key)
      if (!entry) continue
      if (!best || entry.ts > best.ts) best = { ts: entry.ts, data: entry.data }
    }
    return best ? best.data : null
  } catch {
    return null
  }
}
