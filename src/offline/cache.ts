import { idbGet, idbKeys, idbPut } from './db'

const CACHE_STORE = 'cache'

/**
 * Кэш ответов API в IndexedDB. Ключ — полный URL GET-запроса (axios.getUri).
 * Онлайн никогда не читает кэш (network-first), он используется только как
 * фолбэк, когда сеть недоступна, поэтому TTL не применяется — устаревшие
 * данные лучше, чем ничего.
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
    // Кэш — не критичный слой: ошибки записи игнорируем
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
    // относительный ключ (без base) — берём всё до «?», как в cacheApply
    return key.split('?')[0]
  }
}

/**
 * Возвращает самый свежий кэш-ответ по pathname (эндпоинту), игнорируя
 * query-параметры. Нужен для GET с дата-окнами (календарь, табель, отсутствия),
 * чей полный URL зависит от «сегодня» и после воспроизводки отличается от
 * прогретого: точный ключ не совпадает, но данные эндпоинта в кэше есть.
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
