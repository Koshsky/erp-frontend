import { ref } from 'vue'
import axios, { type AxiosError, type Method } from 'axios'
import { idbAll, idbCount, idbDel, idbPut } from './db'
import { applyToCache } from './cacheApply'

/**
 * Очередь мутаций (outbox-паттерн): запросы создания/изменения/удаления,
 * сделанные в офлайне, сохраняются в IndexedDB и отправляются в бэкенд при
 * появлении сети (см. sync.ts). Отображение при этом уже обновлено
 * оптимистично (UI в сторе), а здесь хранится «сырой» запрос для повтора.
 *
 * FIFO: записи выполняются строго по порядку — последующие правки/удаления
 * сущностей, созданных в офлайне, зависят от предыдущих.
 */

const OUTBOX_STORE = 'outbox'
const TOKEN_KEY = 'mvs_erp_access_token'
/** Таймаут probe доступности сервера */
const REACH_PROBE_TIMEOUT_MS = 4000

export type MutationEntity =
  | 'resource'
  | 'employee'
  | 'state'
  | 'period'
  | 'project'
  | 'process'
  | 'task'
  | 'milestone'
  | 'assignment'
  | 'reorder'

export interface OutboxEntry {
  id: string
  /** Порядок отправки (FIFO) */
  ts: number
  method: Method
  /** Полный абсолютный URL запроса (включая query-параметры) */
  url: string
  body?: unknown
  entity: MutationEntity
  /** Временный (отрицательный) id для сущностей, созданных офлайн */
  tempId?: number
  failed?: { message: string; at: number }
}

export const OUTBOX_STORE_NAME = OUTBOX_STORE

/** Число ожидающих синхронизации изменений (реактивно для UI) */
export const pendingCount = ref(0)

export async function refreshPendingCount(): Promise<void> {
  pendingCount.value = await idbCount(OUTBOX_STORE).catch(() => 0)
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** axios сериализует config.data (transformRequest) — приводим к объекту */
function normalizeBody(body: unknown): unknown {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  }
  return body
}

export async function enqueueMutation(
  entry: Omit<OutboxEntry, 'id' | 'ts' | 'failed'>,
): Promise<void> {
  const rec: OutboxEntry = { ...entry, body: normalizeBody(entry.body), id: uid(), ts: Date.now() }
  await idbPut(OUTBOX_STORE, rec.id, rec)
  await refreshPendingCount()
  // Write-through: применяем дельту к «нагретым» данным (кэш GET-ответов),
  // чтобы после перезагрузки страницы офлайн изменения не пропадали.
  await applyToCache(rec)
}

/** Подменяет временные id на реальные (после успешных созданий в очереди) */
function rewriteIds(input: string, idMap: Map<number, number>): string {
  let out = input
  for (const [temp, real] of idMap) {
    out = out.split(String(temp)).join(String(real))
  }
  return out
}

function isNetworkError(e: unknown): boolean {
  const err = e as AxiosError
  return Boolean(err && !err.response && (err.code === 'ERR_NETWORK' || err.message === 'Network Error'))
}

export { isNetworkError }

function errorMessage(e: unknown): string {
  const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string }
  return err?.response?.data?.error?.message ?? err?.message ?? String(e)
}

export { errorMessage }

/**
 * Проверка реальной доступности сервера. navigator.onLine врёт (на «мёртвом»
 * WiFi он true), поэтому перед отправкой очереди убеждаемся, что сервер
 * отвечает. Любой HTTP-статус (<500) = достижим; сеть недоступна только при
 * сетевой ошибке/таймауте.
 */
async function isServerReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), REACH_PROBE_TIMEOUT_MS)
    try {
      const res = await fetch('/precache-manifest.json', { cache: 'no-store', signal: ctrl.signal })
      return res.status < 500
    } finally {
      window.clearTimeout(timer)
    }
  } catch {
    return false
  }
}

export interface FlushResult {
  ok: number
  failed: number
  /** Очередь не была отправлена до конца (сеть снова упала) */
  interrupted: boolean
  /** Домены, затронутые отправленными/проваленными записями (для реконсила) */
  entities: Set<MutationEntity>
}

let flushing = false

/**
 * Отправляет очередь в бэкенд. Один запуск за раз; при повторном входе в сеть
 * оставшиеся записи уйдут следующим flush'ем.
 */
export async function flushOutbox(): Promise<FlushResult> {
  if (flushing) return { ok: 0, failed: 0, interrupted: false, entities: new Set() }
  flushing = true
  const result: FlushResult = { ok: 0, failed: 0, interrupted: false, entities: new Set() }
  try {
    // Сервер недоступен (мёртвый WiFi, интернета нет) — очередь не трогаем:
    // тихий пропуск, без reconcile и без потери/порчи записей.
    if (!(await isServerReachable())) {
      return { ok: 0, failed: 0, interrupted: false, entities: new Set() }
    }

    const entries = (await idbAll<OutboxEntry>(OUTBOX_STORE)).sort((a, b) => a.ts - b.ts)
    const idMap = new Map<number, number>()

    for (const entry of entries) {
      result.entities.add(entry.entity)
      const url = rewriteIds(entry.url, idMap)
      const body = entry.body != null ? rewriteIds(JSON.stringify(entry.body), idMap) : undefined
      try {
        const token = localStorage.getItem(TOKEN_KEY) ?? ''
        const res = await axios({
          method: entry.method,
          url,
          data: body != null ? (JSON.parse(body) as unknown) : undefined,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          timeout: 15000,
        })

        // Создание вернуло реальную сущность → запоминаем temp→real для
        // переписывания последующих записей очереди.
        if (entry.tempId != null) {
          const created = res.data?.data as { id?: number } | undefined
          if (created?.id != null) idMap.set(entry.tempId, created.id)
        }

        await idbDel(OUTBOX_STORE, entry.id)
        result.ok++
      } catch (e) {
        // Нет HTTP-ответа (ERR_NETWORK, таймаут, abort) — сеть снова оборвалась:
        // останавливаемся, запись НЕ помечаем failed и НЕ удаляем.
        if (!(e as AxiosError).response) {
          result.interrupted = true
          break
        }
        // Сервер реально ответил (400/409/502...) — это настоящая ошибка.
        await idbPut(OUTBOX_STORE, entry.id, {
          ...entry,
          failed: { message: errorMessage(e), at: Date.now() },
        })
        result.failed++
      }
    }
  } finally {
    flushing = false
    await refreshPendingCount()
  }
  return result
}

/** Очищает очередь (вызывается при logout, чтобы не отправить чужой очереди под новым токеном) */
export async function clearOutbox(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE)
  await Promise.all(entries.map((e) => idbDel(OUTBOX_STORE, e.id)))
  await refreshPendingCount()
}
