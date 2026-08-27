import { ref } from 'vue'
import axios, { type AxiosError, type Method } from 'axios'
import { idbAll, idbDel, idbPut, IDMAP_STORE_NAME, type IdMapEntry } from './db'
import { applyToCache } from './cacheApply'
import { probeBackend } from './state'
import { getApiUrl } from '@/config'
import { getAccessToken } from '../token'

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
  /** Аккаунт (username), под которым запись была создана (для защиты от автосинка под чужим токеном) */
  creator?: string
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

/** Живой прогресс отправки очереди (для UI): { done, total } или null, когда не идёт */
export const pushProgress = ref<{ done: number; total: number } | null>(null)

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
  /** Технические данные записи для просмотра (по клику): method/url/body */
  method: string
  url: string
  body?: unknown
  tempId?: number
  /** Запись не отправилась (есть ошибка), но осталась в очереди */
  error?: boolean
  message?: string
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

/** Короткая подпись изменяемого объекта: название/код (без id — id выводится отдельно) */
function summarizeEntry(entry: OutboxEntry): string {
  const body = (entry.body ?? {}) as Record<string, unknown>
  return firstString(body, ['title', 'name', 'code', 'username', 'last_name']) ?? ''
}

/** Русские подписи ключевых полей для отображения деталей записи */
const FIELD_LABELS: Record<string, string> = {
  code: 'Код',
  title: 'Название',
  name: 'Имя',
  last_name: 'Фамилия',
  first_name: 'Имя',
  middle_name: 'Отчество',
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

/** Форматирует одно поле в пару «подпись → значение» (для деталей и сравнения). */
function formatField(k: string, v: unknown): { key: string; value: string } {
  const value = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return { key: FIELD_LABELS[k] ?? k, value }
}

/** Поля из Record в пары {key,value}, исключая пустые/нулевые значения. */
function fieldsOf(obj: Record<string, unknown> | undefined): Array<{ key: string; value: string }> {
  if (!obj) return []
  const out: Array<{ key: string; value: string }> = []
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') continue
    out.push(formatField(k, v))
  }
  return out
}

/** Только ключевые поля из тела запроса — для компактного отображения */
function detailsOf(entry: OutboxEntry): Array<{ key: string; value: string }> {
  const body = (entry.body ?? {}) as Record<string, unknown>
  const out = fieldsOf(body)
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
    method: (entry.method || '').toUpperCase(),
    url: entry.url,
    body: entry.body,
    tempId: entry.tempId,
    error: entry.failed != null,
    message: entry.failed?.message ?? '',
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
  const rec: OutboxEntry = { ...entry, body: normalizeBody(entry.body), id: uid(), ts: Date.now(), creator: currentUsername() ?? undefined }
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

/**
 * Переводит сохранённый URL записи очереди на ТЕКУЩИЙ API-адрес.
 * URL в записи фиксируется в момент создания мутации и может устареть
 * (сменили сервер, или API_URL меняли для симуляции простоя). Заменяем только
 * origin (схема+хост), путь и query сохраняем — поэтому устаревший/битый хост
 * (например localhosat) больше не ломает отправку: запись уходит по текущему адресу.
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
 * Серверные sentinel-сообщения без деталей → человекочитаемый русский текст.
 * Когда бэкенд присылает развёрнутое сообщение (например «ресурс не
 * принадлежит владельцу задачи») — оно показывается как есть.
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

/** Имя текущего пользователя из сохранённого профиля. Напрямую из localStorage,
 *  без импорта стора (иначе цикл store ↔ outbox). */
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
 * Детерминированные клиентские ошибки (4xx, кроме 409/429): повтор не исправит
 * (нет прав, неверные данные) — карантин сразу. 429 — «замедли темп»; 409 —
 * «в полёте»/бизнес-конфликт от идемпотентности: первый вызов может ещё
 * выполняться (ретрай получит сохранённый ответ) — оба остаются на
 * backoff-ретраях и уходят в карантин после MAX_FAILED_ATTEMPTS.
 */
function isPermanentFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 409 && status !== 429
}

/** Признак «ссылки на ещё не созданный объект»: в URL/body есть отрицательный
 *  (временный, офлайн) id — запись ждёт синхронизации записи-создателя. */
function referencesPendingCreation(url: string, body: unknown): boolean {
  const text = `${url} ${typeof body === 'string' ? body : JSON.stringify(body ?? '')}`
  return /-\d{6,}/.test(text)
}

/** Достаёт реальный id созданной сущности из полезной части ответа { data, error }.
 *  У большинства сущностей id лежит на верхнем уровне (data.id), но у создания
 *  пользователя — во вложенном data.user (DtoCreateUserResult = { user, password }).
 *  Без этого маппинг tempId→realId не создаётся и зависимые записи (например
 *  PUT /user/{tempId}/days) уходят с фейковым id → 404. */
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

/** Idempotency-Key шлём на мутирующие методы (не GET): id записи — стабильный
 *  UUID между ретраями очереди, сервер вернёт сохранённый ответ вместо
 *  повторного выполнения при потере ответа первого вызова. */
function needsIdempotencyKey(method: Method): boolean {
  return (method || 'get').toUpperCase() !== 'GET'
}

/** Подробно логирует ошибку отправки записи очереди (для диагностики). */
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
 * Проверка реальной доступности бэкенда. navigator.onLine врёт (на «мёртвом»
 * WiFi он true), поэтому перед отправкой очереди пингуем настоящий эндпоинт
 * /api/v1/health. Любой HTTP-статус (<500) = достижим; сеть недоступна только
 * при сетевой ошибке/таймауте.
 */
async function isServerReachable(): Promise<boolean> {
  return probeBackend()
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
    // Персистентный маппинг tempId → realId: накоплен прошлыми прогонами
    // (прерванный flush, повторные запуски). Без него записи, ссылающиеся на
    // уже отправленные создания, ушли бы с фейковым id → 404 «Объект не найден».
    const persisted = await idbAll<IdMapEntry>(IDMAP_STORE_NAME).catch(() => [] as IdMapEntry[])
    const idMap = new Map<number, number>(persisted.map((e) => [e.temp, e.real]))
    pushProgress.value = { done: 0, total: entries.length }
    let done = 0

    for (const entry of entries) {
      // Карантин и backoff: не дёргаем записи, которые сервер только что отверг.
      if (entry.quarantined) continue
      if (entry.failed && Date.now() - entry.failed.at < FAILED_BACKOFF_MS) continue

      result.entities.add(entry.entity)

      // Очередь привязана к аккаунту создателя: не отправляем правки, сделанные
      // под другим пользователем (автовход мог сменить аккаунт) — сервер
      // отклонил бы их по RBAC, а правка осталась бы «зависшей».
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

        // Создание вернуло реальную сущность → запоминаем temp→real для
        // переписывания последующих записей очереди. Маппинг пишем в IndexedDB
        // ДО удаления записи-создания: даже если flush оборвётся сразу после,
        // следующий прогон перепишет зависящие записи реальным id.
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
        // Ошибка без HTTP-ответа (ERR_NETWORK, таймаут, abort). Это не всегда
        // обрыв сети: перед отправкой health-проба прошла, поэтому сервер мог
        // быть жив, а «пропал» конкретный запрос (таймаут/единичный сбой).
        if (!err.response) {
          // Перепроверяем здоровье бэкенда: если он снова недоступен — это
          // реальный обрыв, прерываем остаток очереди.
          if (!(await isServerReachable())) {
            result.interrupted = true
            break
          }
          // Бэкенд жив: одиночная ошибка конкретной записи. Помечаем её failed
          // (остаётся в очереди) и продолжаем отправку остальных — одна упавшая
          // запись не должна рвать всю синхронизацию.
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
          // DELETE несуществующей сущности (404/410) — она уже удалена, целевое
          // состояние достигнуто. Идемпотентный сброс вместо вечных ретраев.
          const status = err.response.status
          const method = (entry.method || '').toUpperCase()
          if (method === 'DELETE' && (status === 404 || status === 410)) {
            await idbDel(OUTBOX_STORE, entry.id)
            result.ok++
          } else {
            // Сервер реально ответил (400/403/409/422/500...) — настоящая ошибка.
            // Детерминированные 4xx (кроме 429) уходят в карантин сразу — повтор
            // не исправит; 5xx — считаем попытки с backoff.
            logOutboxError(entry, url, e)
            const attempts = (entry.attempts ?? 0) + 1
            // Запись ссылается на ещё не синхронизированный объект (в URL/body
            // отрицательный временный id — например PUT /user/{tempId}/days до
            // создания сотрудника). Такой 404 — не фатальный: создатель уйдёт
            // следующим flush'ем (или после «Повторить»), поэтому на карантин
            // не ставим, оставляем на backoff-ретраях.
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
      // Рейт-лимит: пауза между реальными отправками, чтобы не слать пачку
      // запросов (прогревка и очередь не должны класть сервер на колени).
      await pause()
      done++
      pushProgress.value = { done, total: entries.length }
    }
  } finally {
    flushing = false
    pushProgress.value = null
    await refreshPendingCount()
    // Очередь отправлена целиком (ни записей, ни зависимостей) — маппинги
    // больше не нужны (reconcile вернул в стор реальные id). Если в очереди
    // ещё есть записи (прерывание/ошибки) — маппинг сохраняем: следующий
    // прогон перепишет ими зависящие URL/body.
    const remaining = await idbAll<OutboxEntry>(OUTBOX_STORE).catch(() => [] as OutboxEntry[])
    if (remaining.length === 0) {
      const maps = await idbAll<IdMapEntry>(IDMAP_STORE_NAME).catch(() => [] as IdMapEntry[])
      await Promise.all(maps.map((m) => idbDel(IDMAP_STORE_NAME, String(m.temp))))
    }
  }
  return result
}

/** Очищает очередь (вызывается при logout, чтобы не отправить чужой очереди под новым токеном) */
export async function clearOutbox(): Promise<void> {
  const entries = await idbAll<OutboxEntry>(OUTBOX_STORE)
  await Promise.all(entries.map((e) => idbDel(OUTBOX_STORE, e.id)))
  // Вместе с очередью сбрасываем маппинги: отрицательные id новой сессии не
  // должны случайно подмениться старыми соответствиями.
  const maps = await idbAll<IdMapEntry>(IDMAP_STORE_NAME).catch(() => [] as IdMapEntry[])
  await Promise.all(maps.map((m) => idbDel(IDMAP_STORE_NAME, String(m.temp))))
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
