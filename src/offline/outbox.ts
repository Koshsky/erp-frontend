import { ref } from 'vue'
import axios, { type AxiosError, type Method } from 'axios'
import { idbAll, idbDel, idbPut, IDMAP_STORE_NAME, type IdMapEntry } from './db'
import { applyToCache } from './cacheApply'
import { probeBackend } from './state'
import { getApiUrl } from '@/config'
import { getAccessToken } from '../token'

/**
 * Mutation queue (outbox pattern): create/update/delete requests made
 * while offline are stored in IndexedDB and sent to the backend when the
 * network returns (see sync.ts). The view is already updated optimistically
 * (UI in the store), while the raw request is kept here for replay.
 *
 * FIFO: entries are executed strictly in order — later edits/deletes of
 * entities created offline depend on previous ones.
 */

const OUTBOX_STORE = 'outbox'
/** How long to wait before retrying an entry rejected by the server */
const FAILED_BACKOFF_MS = 60 * 1000
/** After how many server errors an entry goes to quarantine (no auto-retries) */
const MAX_FAILED_ATTEMPTS = 5
/** Outbox send rate (entries/sec) — to avoid hammering the server with a batch */
const SYNC_RATE_PER_SECOND = 10
const PAUSE_MS = 1000 / SYNC_RATE_PER_SECOND

export type MutationEntity =
  | 'resource'
  | 'user'
  | 'member'
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
  /** Send order (FIFO) */
  ts: number
  method: Method
  /** Full absolute URL of the request (including query parameters) */
  url: string
  body?: unknown
  entity: MutationEntity
  /** Temporary (negative) id for entities created offline */
  tempId?: number
  /** Account (username) under which the entry was created (guard against autosync under a foreign token) */
  creator?: string
  failed?: { message: string; at: number }
  /** How many times the server answered with an error (for quarantine) */
  attempts?: number
  /** The server consistently rejects the entry — auto-retries are stopped */
  quarantined?: boolean
}

/** An entry that could not be sent (for UI: list of sync errors) */
export interface FailedSyncItem {
  method: Method
  url: string
  message: string
}

export const OUTBOX_STORE_NAME = OUTBOX_STORE

/** Number of changes awaiting sync (reactive for UI). Quarantined ones are not counted. */
export const pendingCount = ref(0)

/** Live queue push progress (for UI): { done, total } or null when not running */
export const pushProgress = ref<{ done: number; total: number } | null>(null)

/**
 * Human-readable representation of a queue entry for UI ("Change queue"
 * on the sync screen): which object, which operation and key fields.
 */
export interface QueueViewItem {
  id: string
  /** Send order (FIFO) */
  ts: number
  entity: MutationEntity
  entityLabel: string
  operation: 'create' | 'update' | 'delete'
  operationLabel: string
  /** Target id from the URL (or temporary id for entries created offline) */
  targetId?: number
  /** Short caption of the changed object (title/name/code/dates) */
  summary: string
  /** Key fields from the request body (for display) */
  details: Array<{ key: string; value: string }>
  /** Technical entry data for inspection (on click): method/url/body */
  method: string
  url: string
  body?: unknown
  tempId?: number
  /** The entry failed to send (has an error) but remains in the queue */
  error?: boolean
  message?: string
}

/** Russian entity names for display in the queue */
const ENTITY_LABELS: Record<MutationEntity, string> = {
  resource: 'Ресурс',
  user: 'Сотрудник',
  member: 'Участник ресурса',
  state: 'Статус',
  period: 'Период табеля',
  project: 'Проект',
  process: 'Процесс',
  task: 'Задача',
  milestone: 'Веха',
  assignment: 'Назначение',
  reorder: 'Приоритет/порядок',
}

export function entityLabel(entity: MutationEntity): string {
  return ENTITY_LABELS[entity] ?? entity
}

export function operationLabel(method: string): string {
  switch ((method || '').toUpperCase()) {
    case 'POST':
      return 'Создание'
    case 'PUT':
    case 'PATCH':
      return 'Изменение'
    case 'DELETE':
      return 'Удаление'
    default:
      return (method || '').toUpperCase()
  }
}

function operationOf(method: string): QueueViewItem['operation'] {
  switch ((method || '').toUpperCase()) {
    case 'POST':
      return 'create'
    case 'PUT':
    case 'PATCH':
      return 'update'
    case 'DELETE':
      return 'delete'
    default:
      return 'update'
  }
}

function firstString(body: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!body) return undefined
  for (const k of keys) {
    const v = body[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

/** Short caption of the changed object: title/code (no id — id is shown separately) */
function summarizeEntry(entry: OutboxEntry): string {
  const body = (entry.body ?? {}) as Record<string, unknown>
  return firstString(body, ['title', 'name', 'code', 'username', 'last_name']) ?? ''
}

/** Russian labels for key fields shown in entry details */
const FIELD_LABELS: Record<string, string> = {
  code: 'Код',
  title: 'Название',
  name: 'Имя',
  last_name: 'Фамилия',
  first_name: 'Имя',
  middle_name: 'Отчество',
  username: 'Логин',
  position: 'Должность',
  preset: 'Пресет прав',
  priority: 'Приоритет',
  start_date: 'Начало',
  end_date: 'Конец',
  date: 'Дата',
  owner_id: 'Владелец',
  project_id: 'Проект',
  process_id: 'Процесс',
  task_id: 'Задача',
  resource_id: 'Ресурс',
  user_id: 'Сотрудник',
  state_id: 'Статус',
  quantity: 'Кол-во',
}

/** Formats one field into a "label → value" pair (for details and comparison). */
function formatField(k: string, v: unknown): { key: string; value: string } {
  const value = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return { key: FIELD_LABELS[k] ?? k, value }
}

/** Fields from a Record into {key,value} pairs, excluding empty/null values. */
function fieldsOf(obj: Record<string, unknown> | undefined): Array<{ key: string; value: string }> {
  if (!obj) return []
  const out: Array<{ key: string; value: string }> = []
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') continue
    out.push(formatField(k, v))
  }
  return out
}

/** Only the key fields from the request body — for compact display */
function detailsOf(entry: OutboxEntry): Array<{ key: string; value: string }> {
  const body = (entry.body ?? {}) as Record<string, unknown>
  const out = fieldsOf(body)
  // Timesheet period: DELETE carries the range in query parameters, not in the body.
  if (entry.entity === 'period' && Object.keys(body).length === 0) {
    try {
      const u = new URL(entry.url, 'https://mvs.local')
      const start = u.searchParams.get('start_date')
      const end = u.searchParams.get('end_date')
      const state = u.searchParams.get('state_id')
      if (start) out.push({ key: 'Начало', value: start })
      if (end) out.push({ key: 'Конец', value: end })
      if (state) out.push({ key: 'Статус', value: state })
    } catch {
      // invalid URL — skip the query data
    }
  }
  return out
}

/** Target id from the last URL segment (PUT/DELETE /entity/{id}), otherwise — temporary id */
function entryIdOf(entry: OutboxEntry): number | undefined {
  if (entry.tempId != null) return entry.tempId
  try {
    const p = new URL(entry.url, 'https://mvs.local').pathname.replace(/\/+$/, '')
    const seg = p.split('/').pop() ?? ''
    const n = Number(seg)
    return Number.isFinite(n) ? n : undefined
  } catch {
    return undefined
  }
}

function toViewItem(entry: OutboxEntry): QueueViewItem {
  return {
    id: entry.id,
    ts: entry.ts,
    entity: entry.entity,
    entityLabel: entityLabel(entry.entity),
    operation: operationOf(entry.method),
    operationLabel: operationLabel(entry.method),
    targetId: entryIdOf(entry),
    summary: summarizeEntry(entry),
    details: detailsOf(entry),
    method: (entry.method || '').toUpperCase(),
    url: entry.url,
    body: entry.body,
    tempId: entry.tempId,
    error: entry.failed != null,
    message: entry.failed?.message ?? '',
  }
}

/** Reactive list of changes awaiting send (for the sync screen) */
export const queueItems = ref<QueueViewItem[]>([])

/** Re-reads the queue into queueItems. Only unsent and non-synced
 *  entries (!quarantined), in send order (FIFO). Quarantined ones are visible in the errors block. */
export async function refreshQueue(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  queueItems.value = entries
    .filter((e) => !e.quarantined)
    .sort((a, b) => a.ts - b.ts)
    .map(toViewItem)
}

export async function refreshPendingCount(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  pendingCount.value = entries.filter((e) => !e.quarantined).length
  await refreshQueue()
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** axios serializes config.data (transformRequest) — normalize to an object */
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
  const rec: OutboxEntry = { ...entry, body: normalizeBody(entry.body), id: uid(), ts: Date.now(), creator: currentUsername() ?? undefined }
  // Deduplication: a repeated click on the same mutation (method+url+body) does not
  // spawn identical entries — the queue stays clean and flush does not send duplicate batches.
  const bodyKey = rec.body != null ? JSON.stringify(rec.body) : ''
  const existing = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  const dup = existing.some(
    (e) =>
      e.method === rec.method &&
      e.url === rec.url &&
      (e.body != null ? JSON.stringify(e.body) : '') === bodyKey,
  )
  if (dup) return
  await idbPut(OUTBOX_STORE, rec.id, rec)
  await refreshPendingCount()
  // Write-through: apply the delta to "warmed" data (cache of GET responses)
  // so that offline changes do not disappear after a page reload.
  await applyToCache(rec)
}

/** Replaces temporary ids with real ones (after successful creates in the queue) */
function rewriteIds(input: string, idMap: Map<number, number>): string {
  let out = input
  for (const [temp, real] of idMap) {
    out = out.split(String(temp)).join(String(real))
  }
  return out
}

/**
 * Rebases a stored queue URL onto the CURRENT API address.
 * The URL in an entry is fixed at mutation creation time and may become stale
 * (server changed, or API_URL was changed to simulate an outage). We replace only the
 * origin (scheme+host); path and query are kept — so a stale/broken host
 * (e.g. localhosat) no longer breaks sending: the entry goes out to the current address.
 */
function rebasedUrl(url: string): string {
  const current = getApiUrl()
  try {
    const u = new URL(url, current ?? 'http://localhost')
    if (current) {
      const base = new URL(current)
      u.protocol = base.protocol
      u.host = base.host
    }
    return u.toString()
  } catch {
    return url
  }
}

function isNetworkError(e: unknown): boolean {
  const err = e as AxiosError
  return Boolean(err && !err.response && (err.code === 'ERR_NETWORK' || err.message === 'Network Error'))
}

export { isNetworkError }

/**
 * Server sentinel messages without details → human-readable Russian text.
 * When the backend sends a detailed message (e.g. "resource does not
 * belong to the task owner") it is shown as is.
 */
const GENERIC_SERVER_MESSAGES: Record<string, string> = {
  forbidden: 'Нет прав на операцию (403)',
  unauthorized: 'Требуется авторизация (401)',
  'not found': 'Объект не найден (404)',
  'bad request': 'Некорректные данные (400)',
  conflict: 'Конфликт: такой объект уже существует (409)',
  'validation failed': 'Ошибка валидации (422)',
}

function errorMessage(e: unknown): string {
  const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string }
  const server = err?.response?.data?.error?.message
  if (server && GENERIC_SERVER_MESSAGES[server] != null) return GENERIC_SERVER_MESSAGES[server]
  return server ?? err?.message ?? String(e)
}

export { errorMessage }

/** Name of the current user from the saved profile. Straight from localStorage,
 *  without importing the store (otherwise a store ↔ outbox cycle). */
function currentUsername(): string | null {
  try {
    const raw = localStorage.getItem('mvs_erp_user')
    if (!raw) return null
    const u = JSON.parse(raw) as { username?: string }
    return u.username ?? null
  } catch {
    return null
  }
}

/**
 * Deterministic client errors (4xx except 409/429): retrying won't fix them
 * (no permissions, invalid data) — quarantine immediately. 429 — "slow down"; 409 —
 * "in-flight"/idempotency business conflict: the first call may still be
 * running (a retry gets the saved response) — both stay on
 * backoff retries and go to quarantine after MAX_FAILED_ATTEMPTS.
 */
function isPermanentFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 409 && status !== 429
}

/** Marker "references a not-yet-created object": the URL/body has a negative
 *  (temporary, offline) id — the entry waits for the creator entry to sync. */
function referencesPendingCreation(url: string, body: unknown): boolean {
  const text = `${url} ${typeof body === 'string' ? body : JSON.stringify(body ?? '')}`
  return /-\d{6,}/.test(text)
}

/** Extracts the real id of the created entity from the payload { data, error }.
 *  For most entities the id is at the top level (data.id), but for user creation
 *  it is in the nested data.user (DtoCreateUserResult = { user, password }).
 *  Without this the tempId→realId mapping is not created and dependent entries (e.g.
 *  PUT /user/{tempId}/days) go out with a fake id → 404. */
function createdIdOf(data: unknown): number | undefined {
  if (!data || typeof data !== 'object') return undefined
  const obj = data as Record<string, unknown>
  if (typeof obj.id === 'number') return obj.id
  const nested = obj.user
  if (nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>).id === 'number') {
    return (nested as Record<string, unknown>).id as number
  }
  return undefined
}

/** Idempotency-Key is sent on mutating methods (not GET): the entry id — a stable
 *  UUID across queue retries — makes the server return the saved response instead of
 *  re-executing when the first call's response was lost. */
function needsIdempotencyKey(method: Method): boolean {
  return (method || 'get').toUpperCase() !== 'GET'
}

/** Logs a queue entry send error in detail (for diagnostics). */
function logOutboxError(entry: OutboxEntry, url: string, e: unknown): void {
  const err = e as AxiosError & { code?: string; timeout?: number }
  const base = {
    method: (entry.method || '').toUpperCase(),
    url,
    body: entry.body,
    tempId: entry.tempId,
    entity: entry.entity,
    message: errorMessage(e),
  }
  const detail = err.response
    ? { kind: 'http', status: err.response.status, statusText: err.response.statusText }
    : {
        kind: 'network',
        code: err.code,
        timeout_ms: err.timeout,
        message: err.message,
      }
  // eslint-disable-next-line no-console
  console.error('[outbox] не удалось отправить запись:', base, detail, {
    config: err.config ? { method: err.config.method, url: err.config.url, data: err.config.data } : undefined,
  })
}

/**
 * Real backend availability check. navigator.onLine lies (on "dead"
 * WiFi it is true), so before sending the queue we ping the real
 * /api/v1/health endpoint. Any HTTP status (<500) = reachable; the network is
 * unavailable only on a network error/timeout.
 */
async function isServerReachable(): Promise<boolean> {
  return probeBackend()
}

export interface FlushResult {
  ok: number
  failed: number
  /** The queue was not fully sent (the network dropped again) */
  interrupted: boolean
  /** Domains touched by sent/failed entries (for reconcile) */
  entities: Set<MutationEntity>
  /** Details of unsent entries (for UI) */
  failedEntries: FailedSyncItem[]
}

let flushing = false

/** Pause between queue entry sends (rate limit) */
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
}

/**
 * Sends the queue to the backend. One run at a time; when the network
 * returns again, the remaining entries go out with the next flush.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const empty = () => ({ ok: 0, failed: 0, interrupted: false, entities: new Set<MutationEntity>(), failedEntries: [] as FailedSyncItem[] })
  if (flushing) return empty()
  flushing = true
  const result: FlushResult = { ok: 0, failed: 0, interrupted: false, entities: new Set(), failedEntries: [] }
  try {
    // Server unreachable (dead WiFi, no internet) — leave the queue alone:
    // quiet skip, no reconcile, no loss/corruption of entries.
    if (!(await isServerReachable())) {
      return empty()
    }

    const entries = (await idbAll<OutboxEntry>(OUTBOX_STORE)).sort((a, b) => a.ts - b.ts)
    // Persistent tempId → realId mapping: accumulated by previous runs
    // (interrupted flush, repeated starts). Without it, entries referencing
    // already-sent creates would go out with a fake id → 404 "Object not found".
    const persisted = await idbAll<IdMapEntry>(IDMAP_STORE_NAME).catch(() => [] as IdMapEntry[])
    const idMap = new Map<number, number>(persisted.map((e) => [e.temp, e.real]))
    pushProgress.value = { done: 0, total: entries.length }
    let done = 0

    for (const entry of entries) {
      // Quarantine and backoff: don't touch entries the server just rejected.
      if (entry.quarantined) continue
      if (entry.failed && Date.now() - entry.failed.at < FAILED_BACKOFF_MS) continue

      result.entities.add(entry.entity)

      // The queue is tied to the creator account: don't send edits made under
      // another user (autologin may have switched accounts) — the server would
      // reject them by RBAC and the edit would remain "stuck".
      const sender = currentUsername()
      if (entry.creator && sender && entry.creator !== sender) {
        const message = `Запись создана под аккаунтом «${entry.creator}», а синхронизация идёт как «${sender}»: переключите сохранённый аккаунт на экране «Синхронизация»`
        await idbPut(OUTBOX_STORE, entry.id, { ...entry, quarantined: true, failed: { message, at: Date.now() } })
        result.failed++
        result.failedEntries.push({ method: entry.method, url: entry.url, message })
        await pause()
        continue
      }

      const url = rewriteIds(rebasedUrl(entry.url), idMap)
      const body = entry.body != null ? rewriteIds(JSON.stringify(entry.body), idMap) : undefined
      try {
        const token = getAccessToken()
        const res = await axios({
          method: entry.method,
          url,
          data: body != null ? (JSON.parse(body) as unknown) : undefined,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(needsIdempotencyKey(entry.method) ? { 'Idempotency-Key': entry.id } : {}),
          },
          timeout: 15000,
        })

        // The create returned a real entity → remember temp→real for later
        // queue entry rewrites. The mapping is written to IndexedDB BEFORE the
        // creator entry is deleted: even if flush breaks right after,
        // the next run rewrites dependent entries with the real id.
        if (entry.tempId != null) {
          const created = createdIdOf(res.data?.data)
          if (created != null) {
            idMap.set(entry.tempId, created)
            await idbPut(IDMAP_STORE_NAME, String(entry.tempId), { temp: entry.tempId, real: created } satisfies IdMapEntry)
          }
        }

        await idbDel(OUTBOX_STORE, entry.id)
        result.ok++
      } catch (e) {
        const err = e as AxiosError
        // Error without an HTTP response (ERR_NETWORK, timeout, abort). This is not
        // always a network drop: the health probe passed before sending, so the
        // server could be alive while a specific request "disappeared" (timeout/one-off failure).
        if (!err.response) {
          // Re-check backend health: if it is unreachable again — this is a
          // real drop, interrupt the rest of the queue.
          if (!(await isServerReachable())) {
            result.interrupted = true
            break
          }
          // Backend is alive: one-off error of a single entry. Mark it failed
          // (stays in the queue) and keep sending the rest — one failed
          // entry must not break the whole sync.
          logOutboxError(entry, url, e)
          const attempts = (entry.attempts ?? 0) + 1
          const quarantined = attempts >= MAX_FAILED_ATTEMPTS
          const message = errorMessage(e) || 'Запрос не выполнен (нет ответа от сервера)'
          await idbPut(OUTBOX_STORE, entry.id, {
            ...entry,
            attempts,
            quarantined,
            failed: { message, at: Date.now() },
          })
          result.failed++
          result.failedEntries.push({ method: entry.method, url, message })
        } else {
          // DELETE of a non-existent entity (404/410) — it is already gone, the target
          // state is reached. Idempotent drop instead of endless retries.
          const status = err.response.status
          const method = (entry.method || '').toUpperCase()
          if (method === 'DELETE' && (status === 404 || status === 410)) {
            await idbDel(OUTBOX_STORE, entry.id)
            result.ok++
          } else {
            // The server actually responded (400/403/409/422/500...) — a real error.
            // Deterministic 4xx (except 429) go to quarantine right away — retrying
            // won't fix; 5xx — count attempts with backoff.
            logOutboxError(entry, url, e)
            const attempts = (entry.attempts ?? 0) + 1
            // The entry references a not-yet-synced object (a negative temporary id in
            // URL/body — e.g. PUT /user/{tempId}/days before the employee is created).
            // Such a 404 is not fatal: the creator will go out with the next
            // flush (or after "Retry"), so we don't quarantine it and keep it
            // on backoff retries.
            const waitsForCreator = referencesPendingCreation(url, body ?? '')
            const quarantined = !waitsForCreator && (isPermanentFailure(status) || attempts >= MAX_FAILED_ATTEMPTS)
            const message =
              waitsForCreator && status === 404
                ? 'Объект ещё не создан: сначала синхронизируется запись-создание с временным id'
                : errorMessage(e)
            await idbPut(OUTBOX_STORE, entry.id, {
              ...entry,
              attempts,
              quarantined,
              failed: { message, at: Date.now() },
            })
            result.failed++
            result.failedEntries.push({ method: entry.method, url, message })
          }
        }
      }
      // Rate limit: pause between actual sends so we don't blast a batch
      // of requests (warmup and the queue must not bring the server to its knees).
      await pause()
      done++
      pushProgress.value = { done, total: entries.length }
    }
  } finally {
    flushing = false
    pushProgress.value = null
    await refreshPendingCount()
    // The queue was fully sent (no entries, no dependencies) — the mappings
    // are no longer needed (reconcile returned real ids to the store). If the queue
    // still has entries (interruption/errors) — keep the mapping: the next
    // run will rewrite dependent URL/body with it.
    const remaining = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
    if (remaining.length === 0) {
      const maps = await idbAll<IdMapEntry>(IDMAP_STORE_NAME).catch(() => [] as IdMapEntry[])
      await Promise.all(maps.map((m) => idbDel(IDMAP_STORE_NAME, String(m.temp))))
    }
  }
  return result
}

/** Clears the queue (called on logout, so someone else's queue is not sent under a new token) */
export async function clearOutbox(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE)
  await Promise.all(entries.map((e) => idbDel(OUTBOX_STORE, e.id)))
  // Along with the queue, reset the mappings: negative ids of a new session must
  // not accidentally be replaced with old correspondences.
  const maps = await idbAll<IdMapEntry>(IDMAP_STORE_NAME).catch(() => [] as IdMapEntry[])
  await Promise.all(maps.map((m) => idbDel(IDMAP_STORE_NAME, String(m.temp))))
  await refreshPendingCount()
}

/** Entries rejected by the server (for the UI sync errors list) */
export async function getFailedEntries(): Promise<
  Array<OutboxEntry & { message: string }>
> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  return entries
    .filter((e) => e.quarantined || e.failed)
    .map((e) => ({ ...e, message: e.failed?.message ?? '' }))
}

/** Lifts quarantine/failed flag so entries are sent again (the "Retry" button) */
export async function resetFailedRetries(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  await Promise.all(
    entries
      .filter((e) => e.quarantined || e.failed)
      .map((e) =>
        idbPut(OUTBOX_STORE, e.id, { ...e, quarantined: false, attempts: 0, failed: undefined }),
      ),
  )
  await refreshPendingCount()
}

/** Removes one rejected entry from the queue */
export async function discardEntry(id: string): Promise<void> {
  await idbDel(OUTBOX_STORE, id)
  await refreshPendingCount()
}

/** Removes all rejected entries (the "Skip" button — the user accepted the loss) */
export async function discardFailed(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  await Promise.all(
    entries.filter((e) => e.quarantined || e.failed).map((e) => idbDel(OUTBOX_STORE, e.id)),
  )
  await refreshPendingCount()
}

/**
 * Applies ALL unsynced queue entries to the GET-response cache
 * (write-through overlay). Idempotent: DELETE/overwrites are safe to repeat,
 * POST does not duplicate by id. Called:
 *  - at app startup (before data load) — an offline reload sees the
 *    unsynced changes;
 *  - after each fresh successful GET write (http.ts) — so warmup/reconcile
 *    do not erase deltas with server truth.
 */
export async function replayOutboxToCache(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  for (const entry of entries) {
    await applyToCache(entry)
  }
}
