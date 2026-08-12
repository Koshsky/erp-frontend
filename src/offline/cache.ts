import { idbGet, idbPut } from './db'

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
    await idbPut(key, entry)
  } catch {
    // Кэш — не критичный слой: ошибки записи игнорируем
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const entry = await idbGet<CachedEntry<T>>(key)
    return entry?.data ?? null
  } catch {
    return null
  }
}
