import { ref } from 'vue'
import axios, { type AxiosError, type Method } from 'axios'
import { idbAll, idbDel, idbPut } from './db'
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
/** Сколько ждать перед повторной попыткой записи, отклонённой сервером */
const FAILED_BACKOFF_MS = 60 * 1000
/** После скольких серверных ошибок запись уходит в карантин (без авто-ретраев) */
const MAX_FAILED_ATTEMPTS = 5
/** Частота отправки записей очереди (шт/сек) — чтобы не молотить сервер пачкой */
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
  /** Сколько раз сервер ответил ошибкой (для карантина) */
  attempts?: number
  /** Сервер стабильно отвергает запись — авто-ретраи остановлены */
  quarantined?: boolean
}

/** Запись, которую не удалось отправить (для UI: список ошибок синхронизации) */
export interface FailedSyncItem {
  method: Method
  url: string
  message: string
}

export const OUTBOX_STORE_NAME = OUTBOX_STORE

/** Число ожидающих синхронизации изменений (реактивно для UI). Карантинные не входят. */
export const pendingCount = ref(0)

/**
 * Человекочитаемое представление записи очереди для UI («Очередь изменений»
 * на экране синхронизации): какой объект, какая операция и ключевые поля.
 */
export interface QueueViewItem {
  id: string
  /** Порядок отправки (FIFO) */
  ts: number
  entity: MutationEntity
  entityLabel: string
  operation: 'create' | 'update' | 'delete'
  operationLabel: string
  /** id цели из URL (или временный id для созданных офлайн) */
  targetId?: number
  /** Короткая подпись изменяемого объекта (title/name/code/даты) */
  summary: string
  /** Ключевые поля из тела запроса (для отображения) */
  details: Array<{ key: string; value: string }>
}

/** Русские имена сущностей для отображения в очереди */
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

function firstNumber(body: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!body) return undefined
  for (const k of keys) {
    const v = body[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

/** Короткая подпись изменяемого объекта: название/код + ключевая ссылка на родителя */
function summarizeEntry(entry: OutboxEntry): string {
  const body = (entry.body ?? {}) as Record<string, unknown>
  const title = firstString(body, ['title', 'name', 'code', 'username'])
  const ref = firstNumber(body, [
    'project_id',
    'process_id',
    'task_id',
    'resource_id',
    'user_id',
    'owner_id',
  ])
  const id = entryIdOf(entry)
  if (title) return ref != null ? `${title} (${ref})` : title
  if (id != null) return `id ${id}`
  return ref != null ? `id ${ref}` : 'без названия'
}

/** Только ключевые поля из тела запроса — для компактного отображения */
function detailsOf(entry: OutboxEntry): Array<{ key: string; value: string }> {
  const body = (entry.body ?? {}) as Record<string, unknown>
  const labelOf: Record<string, string> = {
    code: 'Код',
    title: 'Название',
    name: 'Имя',
    username: 'Логин',
    position: 'Должность',
    role: 'Роль',
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
  const out: Array<{ key: string; value: string }> = []
  for (const [k, v] of Object.entries(body)) {
    if (v == null) continue
    const key = labelOf[k] ?? k
    const value = typeof v === 'object' ? JSON.stringify(v) : String(v)
    out.push({ key, value })
  }
  // Период табеля: DELETE несёт диапазон в query-параметрах, не в теле.
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
      // невалидный URL — пропускаем query-данные
    }
  }
  return out
}

/** id цели из последнего сегмента URL (PUT/DELETE /entity/{id}), иначе — временный id */
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
  }
}

/** Реактивный список ожидающих отправки изменений (для экрана синхронизации) */
export const queueItems = ref<QueueViewItem[]>([])

/** Перечитывает очередь в queueItems. Только не отправленные и не синхронизированные
 *  записи (!quarantined), по порядку отправки (FIFO). Карантинные видны в блоке ошибок. */
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
  // Дедупликация: повторный клик на ту же мутацию (метод+url+тело) не плодит
  // одинаковые записи — очередь остаётся чистой, а flush не шлёт пачки дублей.
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
  /** Подробности неотправленных записей (для UI) */
  failedEntries: FailedSyncItem[]
}

let flushing = false

/** Пауза между отправками записей очереди (рейт-лимит) */
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
}

/**
 * Отправляет очередь в бэкенд. Один запуск за раз; при повторном входе в сеть
 * оставшиеся записи уйдут следующим flush'ем.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const empty = () => ({ ok: 0, failed: 0, interrupted: false, entities: new Set<MutationEntity>(), failedEntries: [] as FailedSyncItem[] })
  if (flushing) return empty()
  flushing = true
  const result: FlushResult = { ok: 0, failed: 0, interrupted: false, entities: new Set(), failedEntries: [] }
  try {
    // Сервер недоступен (мёртвый WiFi, интернета нет) — очередь не трогаем:
    // тихий пропуск, без reconcile и без потери/порчи записей.
    if (!(await isServerReachable())) {
      return empty()
    }

    const entries = (await idbAll<OutboxEntry>(OUTBOX_STORE)).sort((a, b) => a.ts - b.ts)
    const idMap = new Map<number, number>()

    for (const entry of entries) {
      // Карантин и backoff: не дёргаем записи, которые сервер только что отверг.
      if (entry.quarantined) continue
      if (entry.failed && Date.now() - entry.failed.at < FAILED_BACKOFF_MS) continue

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
        const err = e as AxiosError
        // Нет HTTP-ответа (ERR_NETWORK, таймаут, abort) — сеть снова оборвалась:
        // останавливаемся, запись НЕ помечаем failed и НЕ удаляем.
        if (!err.response) {
          result.interrupted = true
          break
        }
        // DELETE несуществующей сущности (404/410) — она уже удалена, целевое
        // состояние достигнуто. Идемпотентный сброс вместо вечных ретраев.
        const status = err.response.status
        const method = (entry.method || '').toUpperCase()
        if (method === 'DELETE' && (status === 404 || status === 410)) {
          await idbDel(OUTBOX_STORE, entry.id)
          result.ok++
        } else {
          // Сервер реально ответил (400/403/409/422/500...) — настоящая ошибка.
          // Считаем попытки; стабильно отвергнутые записи уходят в карантин.
          const attempts = (entry.attempts ?? 0) + 1
          const quarantined = attempts >= MAX_FAILED_ATTEMPTS
          const message = errorMessage(e)
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
      // Рейт-лимит: пауза между реальными отправками, чтобы не слать пачку
      // запросов (прогревка и очередь не должны класть сервер на колени).
      await pause()
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

/** Записи, которые сервер отверг (для UI списка ошибок синхронизации) */
export async function getFailedEntries(): Promise<
  Array<OutboxEntry & { message: string }>
> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  return entries
    .filter((e) => e.quarantined || e.failed)
    .map((e) => ({ ...e, message: e.failed?.message ?? '' }))
}

/** Снимает карантин/флаг failed, чтобы записи ушли повторно (кнопка «Повторить») */
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

/** Удаляет одну отвергнутую запись из очереди */
export async function discardEntry(id: string): Promise<void> {
  await idbDel(OUTBOX_STORE, id)
  await refreshPendingCount()
}

/** Удаляет все отвергнутые записи (кнопка «Пропустить» — пользователь принял потерю) */
export async function discardFailed(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  await Promise.all(
    entries.filter((e) => e.quarantined || e.failed).map((e) => idbDel(OUTBOX_STORE, e.id)),
  )
  await refreshPendingCount()
}

/**
 * Применяет ВСЕ несинхронизированные записи очереди к кэшу GET-ответов
 * (write-through overlay). Идемпотентно: DELETE/перезапись повторно безопасны,
 * POST не дублирует по id. Вызывается:
 *  - при старте приложения (до загрузки данных) — офлайн-перезагрузка видит
 *    несинхронизированные изменения;
 *  - после каждой свежей записи успешного GET (http.ts) — чтобы warmup/reconcile
 *    не стирали дельты серверной правдой.
 */
export async function replayOutboxToCache(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
  for (const entry of entries) {
    await applyToCache(entry)
  }
}
