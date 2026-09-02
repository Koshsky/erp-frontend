<script setup lang="ts">
/**
 * Журнал действий (audit log) — админ-страница: все CRUD-мутации и события
 * авторизации, зафиксированные на сервере в Grafana Loki. Данные читаются
 * через ERP API (/audit/events). Фильтры встроены в шапку таблицы, каждая
 * колонка сортируется (вверх/вниз), причём сортировка применяется к текущей
 * странице (Loki отдаёт страницы без глобальной сортировки по полям).
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuditStore } from '../store'
import type { DtoAuditEventView } from '@/api'

const audit = useAuditStore()
const { items, loading, error } = storeToRefs(audit)

/** Russian labels for entities (used in the filter and the table). */
const ENTITY_LABELS: Record<string, string> = {
  auth: 'Авторизация',
  project: 'Проекты',
  process: 'Процессы',
  task: 'Задачи',
  comment: 'Комментарии',
  milestone: 'Вехи',
  assignment: 'Назначения ресурсов',
  resource: 'Ресурсы табеля',
  resource_member: 'Участники ресурса',
  state: 'Статусы',
  user: 'Пользователи',
  auto_create: 'Автосоздание проектов',
  rbac: 'Права (RBAC)',
}

/** Russian labels for actions (filter + table). */
const ACTION_LABELS: Record<string, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
  reorder: 'Переупорядочивание',
  add: 'Добавление',
  remove: 'Удаление',
  update_manager: 'Изменение руководителя',
  reset_password: 'Сброс пароля',
  change_password: 'Смена пароля',
  set_days: 'Установка дней',
  delete_days: 'Удаление дней',
  create_role: 'Создание роли',
  update_role: 'Изменение роли',
  delete_role: 'Удаление роли',
  upsert_rule: 'Изменение правила',
  delete_rule: 'Удаление правила',
  upsert_policy: 'Изменение политики',
  delete_policy: 'Удаление политики',
  reset: 'Сброс прав',
  login: 'Вход',
  refresh: 'Обновление сессии',
  logout: 'Выход',
}

/** Actions applicable to each entity (mirrors the backend route map in
 * internal/audit/route.go). The action filter options depend on the selected
 * entity so they never offer unrelated actions (e.g. "reset password" for
 * tasks). */
const ENTITY_ACTIONS: Record<string, string[]> = {
  project: ['create', 'update', 'delete'],
  process: ['create', 'update', 'delete', 'reorder'],
  task: ['create', 'update', 'delete', 'reorder'],
  comment: ['create', 'delete'],
  milestone: ['create', 'update', 'delete'],
  assignment: ['create', 'update', 'delete'],
  resource: ['create', 'update', 'delete'],
  resource_member: ['add', 'remove'],
  state: ['create', 'update', 'delete'],
  user: ['create', 'update', 'update_manager', 'delete', 'reset_password', 'set_days', 'delete_days', 'change_password'],
  auto_create: ['update'],
  rbac: ['create_role', 'update_role', 'delete_role', 'upsert_rule', 'delete_rule', 'upsert_policy', 'delete_policy', 'reset'],
  auth: ['login', 'logout'],
}

/** Action options for the filter: restricted to the selected entity, or the
 * full catalog when no entity is chosen. */
const actionOptions = computed<Array<{ key: string; label: string }>>(() => {
  if (filters.entity) {
    const keys = ENTITY_ACTIONS[filters.entity] ?? []
    if (keys.length === 0) return [{ key: '', label: 'Все' }]
    return keys.map((k) => ({ key: k, label: ACTION_LABELS[k] ?? k }))
  }
  return Object.entries(ACTION_LABELS).map(([key, label]) => ({ key, label }))
})

/** Entity changed: drop an action that is not applicable to the new entity
 * (otherwise entity+action contradict each other), then apply. */
function onEntityChange() {
  if (filters.action && !(ENTITY_ACTIONS[filters.entity] ?? []).includes(filters.action)) {
    filters.action = ''
  }
  void applyFilters(0)
}

/** Badge color by action kind: create — green, update — blue, delete — red,
 * auth / anything else — gray (non-mutation). */
type ActionKind = 'create' | 'update' | 'delete' | 'other'
const ACTION_KIND: Record<string, ActionKind> = {
  create: 'create', add: 'create', create_role: 'create',
  update: 'update', update_manager: 'update', reorder: 'update',
  set_days: 'update', upsert_rule: 'update', upsert_policy: 'update',
  reset_password: 'update', change_password: 'update', reset: 'update',
  delete: 'delete', remove: 'delete', delete_days: 'delete',
  delete_rule: 'delete', delete_role: 'delete', delete_policy: 'delete',
}

/** HTTP status groups for the filter (each has its own badge color). */
const STATUS_GROUPS = ['2xx', '3xx', '4xx', '5xx']

/** Filter state (mirrors the backend query params). The date/time filter is a
 * single "С (от даты-времени)" bound: events at this instant and later. */
const filters = reactive({
  entity: '',
  action: '',
  status: '',
  user: '',
  /** Single date-time bound (datetime-local): show events at/after this moment. */
  when: '',
  search: '',
  /** Entity or actor id (matches the ID column: entity_id ?? actor_user_id). */
  id: '',
  /** Actor IP (case-insensitive substring). */
  ip: '',
})

const PAGE_SIZE = 50
const offset = ref(0)

const page = computed(() => Math.floor(offset.value / PAGE_SIZE) + 1)
/** Loki has no exact total — "no more pages" is when the page is shorter than
 * a full page. */
const hasMore = computed(() => items.value.length >= PAGE_SIZE)

/** Expandable detail row (raw request/response JSON). */
const expandedId = ref<number | null>(null)

/** Per-column sort state (applies to the current page, client-side). */
type SortKey = 'ts' | 'actor' | 'entity' | 'action' | 'id' | 'status' | 'ip' | 'duration'
const sortKey = ref<SortKey>('ts')
const sortDir = ref<'asc' | 'desc'>('desc')

function sortValue(ev: DtoAuditEventView, key: SortKey): number | string {
  switch (key) {
    case 'ts':
      return new Date(ev.ts ?? 0).getTime()
    case 'actor':
      return (ev.actor_name || ev.actor_email || '').toLowerCase()
    case 'entity':
      return (ev.entity ?? '').toLowerCase()
    case 'action':
      return (ev.action ?? '').toLowerCase()
    case 'id':
      return ev.entity_id ?? ev.actor_user_id ?? -1
    case 'status':
      return ev.status ?? -1
    case 'ip':
      return (ev.actor_ip ?? '').toLowerCase()
    case 'duration':
      return ev.duration_ms ?? -1
  }
}

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

function isSort(key: SortKey, dir: 'asc' | 'desc'): boolean {
  return sortKey.value === key && sortDir.value === dir
}

const sortedItems = computed<DtoAuditEventView[]>(() => {
  const arr = [...items.value]
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  arr.sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb), 'ru') * dir
  })
  return arr
})

function toRFC3339(value: string): string {
  // datetime-local → "YYYY-MM-DDTHH:mm" → RFC3339 with seconds.
  return value ? `${value}:00` : ''
}

async function applyFilters(presetOffset = 0) {
  offset.value = presetOffset
  await audit.load({
    limit: PAGE_SIZE,
    offset: presetOffset,
    user: filters.user.trim() || undefined,
    entity: filters.entity || undefined,
    action: filters.action || undefined,
    status: filters.status || undefined,
    // Single date-time filter: from this moment onward (no upper bound).
    from: toRFC3339(filters.when),
    search: filters.search.trim() || undefined,
    id: filters.id.trim() || undefined,
    ip: filters.ip.trim() || undefined,
  })
}

function resetFilters() {
  filters.entity = ''
  filters.action = ''
  filters.status = ''
  filters.user = ''
  filters.when = ''
  filters.search = ''
  filters.id = ''
  filters.ip = ''
  sortKey.value = 'ts'
  sortDir.value = 'desc'
  void applyFilters(0)
}

function nextPage() {
  if (hasMore.value) applyFilters(offset.value + PAGE_SIZE)
}

function prevPage() {
  if (page.value > 1) applyFilters(offset.value - PAGE_SIZE)
}

function entityLabel(e: string): string {
  return ENTITY_LABELS[e] ?? e
}

function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a
}

function actionKindOf(a: string | undefined): ActionKind {
  return ACTION_KIND[a ?? ''] ?? 'other'
}

function actorName(ev: DtoAuditEventView): string {
  if (ev.actor_name) return ev.actor_name
  if (ev.actor_email) return ev.actor_email
  return ev.actor_user_id != null ? `#${ev.actor_user_id}` : '—'
}

function formatTS(ts: string | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('ru-RU')
}

function prettyJSON(v: unknown): string {
  if (v == null) return '—'
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

/** Badge class for the HTTP status group (2xx/3xx/4xx/5xx — distinct colors). */
function statusClass(status: number | undefined): string {
  if (status == null) return ''
  if (status < 300) return 'st-2xx'
  if (status < 400) return 'st-3xx'
  if (status < 500) return 'st-4xx'
  return 'st-5xx'
}

function methodClass(method: string | undefined): string {
  switch (method) {
    case 'POST':
      return 'm-post'
    case 'PUT':
      return 'm-put'
    case 'DELETE':
      return 'm-del'
    default:
      return ''
  }
}

onMounted(() => {
  void applyFilters(0)
})
</script>

<template>
  <section class="al">
    <div class="al-head">
      <h2 class="al-title">Журнал действий</h2>
      <div class="al-head-tools">
        <input
          v-model="filters.search"
          class="al-search"
          type="text"
          placeholder="Поиск по строке события..."
          @keyup.enter="applyFilters(0)"
        />
        <button type="button" class="al-btn" :disabled="loading" @click="applyFilters(offset)">Обновить</button>
        <button type="button" class="al-btn" @click="resetFilters">Сбросить</button>
      </div>
    </div>

    <p v-if="loading && !items.length" class="al-st">Загрузка...</p>
    <p v-if="loading && items.length" class="al-refreshing">Обновление…</p>
    <p v-if="error" class="al-st er">{{ error }}</p>

    <!-- Table: header (titles + sort), embedded filter row, data rows.
         Never unmounts while data is present: during a filter-triggered reload
         the previous rows stay visible (dimmed) until the new ones arrive,
         so the table does not blink/disappear. -->
    <div
      v-if="items.length > 0 || (!loading && !error)"
      class="al-table"
      :class="{ 'al-table--loading': loading && items.length > 0 }"
    >
      <div class="al-row al-th">
        <div class="al-th-cell">
          <span>Время</span>
          <span class="al-sorts">
            <button type="button" :class="{ on: isSort('ts', 'asc') }" title="Сортировать ↑" @click="toggleSort('ts')">↑</button>
            <button type="button" :class="{ on: isSort('ts', 'desc') }" title="Сортировать ↓" @click="toggleSort('ts')">↓</button>
          </span>
        </div>
        <div class="al-th-cell">
          <span>Пользователь</span>
          <span class="al-sorts">
            <button type="button" :class="{ on: isSort('actor', 'asc') }" @click="toggleSort('actor')">↑</button>
            <button type="button" :class="{ on: isSort('actor', 'desc') }" @click="toggleSort('actor')">↓</button>
          </span>
        </div>
        <div class="al-th-cell">
          <span>Сущность</span>
          <span class="al-sorts">
            <button type="button" :class="{ on: isSort('entity', 'asc') }" @click="toggleSort('entity')">↑</button>
            <button type="button" :class="{ on: isSort('entity', 'desc') }" @click="toggleSort('entity')">↓</button>
          </span>
        </div>
        <div class="al-th-cell">
          <span>Действие</span>
          <span class="al-sorts">
            <button type="button" :class="{ on: isSort('action', 'asc') }" @click="toggleSort('action')">↑</button>
            <button type="button" :class="{ on: isSort('action', 'desc') }" @click="toggleSort('action')">↓</button>
          </span>
        </div>
        <div class="al-th-cell">
          <span>ID</span>
          <span class="al-sorts">
            <button type="button" :class="{ on: isSort('id', 'asc') }" @click="toggleSort('id')">↑</button>
            <button type="button" :class="{ on: isSort('id', 'desc') }" @click="toggleSort('id')">↓</button>
          </span>
        </div>
        <div class="al-th-cell">
          <span>Статус</span>
          <span class="al-sorts">
            <button type="button" :class="{ on: isSort('status', 'asc') }" @click="toggleSort('status')">↑</button>
            <button type="button" :class="{ on: isSort('status', 'desc') }" @click="toggleSort('status')">↓</button>
          </span>
        </div>
        <div class="al-th-cell">
          <span>IP</span>
          <span class="al-sorts">
            <button type="button" :class="{ on: isSort('ip', 'asc') }" @click="toggleSort('ip')">↑</button>
            <button type="button" :class="{ on: isSort('ip', 'desc') }" @click="toggleSort('ip')">↓</button>
          </span>
        </div>
        <div class="al-th-cell">
          <span>Время, мс</span>
          <span class="al-sorts">
            <button type="button" :class="{ on: isSort('duration', 'asc') }" @click="toggleSort('duration')">↑</button>
            <button type="button" :class="{ on: isSort('duration', 'desc') }" @click="toggleSort('duration')">↓</button>
          </span>
        </div>
      </div>

      <!-- Per-column filters embedded in the header -->
      <div class="al-row al-th al-filter-row">
        <div class="al-filter">
          <input v-model="filters.when" type="datetime-local" title="Показывать с этого момента" @change="applyFilters(0)" />
        </div>
        <div class="al-filter">
          <input v-model="filters.user" type="text" placeholder="Логин или ФИО" @keyup.enter="applyFilters(0)" />
        </div>
        <div class="al-filter">
          <select v-model="filters.entity" @change="onEntityChange">
            <option value="">Все</option>
            <option v-for="(label, key) in ENTITY_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <div class="al-filter">
          <select v-model="filters.action" @change="applyFilters(0)">
            <option value="">Все</option>
            <option v-for="opt in actionOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
          </select>
        </div>
        <div class="al-filter">
          <input v-model="filters.id" type="text" inputmode="numeric" placeholder="ID" title="ID сущности или пользователя" @keyup.enter="applyFilters(0)" />
        </div>
        <div class="al-filter">
          <select v-model="filters.status" @change="applyFilters(0)">
            <option value="">Все</option>
            <option v-for="g in STATUS_GROUPS" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>
        <div class="al-filter">
          <input v-model="filters.ip" type="text" placeholder="IP (точный)" title="Полный IP адрес актора" @keyup.enter="applyFilters(0)" />
        </div>
        <div></div>
      </div>

      <template v-if="items.length">
        <div
          v-for="ev in sortedItems"
          :key="ev.id"
          class="al-row"
          :class="{ 'al-row--open': expandedId === ev.id }"
          @click="expandedId = expandedId === ev.id ? null : (ev.id ?? null)"
        >
          <div class="al-ts">{{ formatTS(ev.ts) }}</div>
          <div class="al-actor">
            <span class="al-actor-name">{{ actorName(ev) }}</span>
            <!-- Login on its own line only when a separate full name is shown
                 (prevents the "admin / admin" duplication). -->
            <span v-if="ev.actor_name && ev.actor_email && ev.actor_email !== ev.actor_name" class="al-actor-login">{{ ev.actor_email }}</span>
            <span v-if="ev.actor_role" class="al-actor-role">{{ ev.actor_role }}</span>
          </div>
          <div>{{ entityLabel(ev.entity ?? '') }}</div>
          <div>
            <span class="al-action" :class="`al-action--${actionKindOf(ev.action)}`">
              {{ actionLabel(ev.action ?? '') }}
            </span>
          </div>
          <div>{{ ev.entity_id ?? ev.actor_user_id ?? '—' }}</div>
          <div><span class="al-status" :class="statusClass(ev.status)">{{ ev.status }}</span></div>
          <div class="al-ip">{{ ev.actor_ip || '—' }}</div>
          <div>{{ ev.duration_ms ?? '—' }}</div>

          <!-- Expanded detail -->
          <div v-if="expandedId === ev.id" class="al-detail">
            <div class="al-detail-meta">
              <span class="al-method" :class="methodClass(ev.method)">{{ ev.method }}</span>
              <code>{{ ev.path }}</code>
            </div>
            <div class="al-detail-cols">
              <div class="al-detail-col">
                <div class="al-detail-title">Тело запроса</div>
                <pre>{{ prettyJSON(ev.request_body) }}</pre>
              </div>
              <div class="al-detail-col">
                <div class="al-detail-title">Тело ответа</div>
                <pre>{{ prettyJSON(ev.response_body) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </template>
      <p v-else class="al-st">Нет записей</p>
    </div>

    <!-- Pagination -->
    <div v-if="items.length > 0" class="al-pager">
      <button type="button" :disabled="page <= 1" @click="prevPage">← Назад</button>
      <span>Стр. {{ page }} (показано {{ items.length }})</span>
      <button type="button" :disabled="!hasMore" @click="nextPage">Вперёд →</button>
    </div>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.al-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.al-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--ui-text);
  margin: 0;
}

.al-head-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.al-search {
  border: 1px solid var(--ui-border-strong);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 13px;
  color: var(--ui-text);
  background: var(--ui-surface-2);
  min-width: 240px;
}

.al-btn {
  border: 1px solid var(--ui-border-strong);
  background: var(--ui-surface);
  color: var(--ui-text);
  border-radius: 8px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s ease;
  white-space: nowrap;
}

.al-btn:hover {
  background: var(--ui-surface-3);
}

.al-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.al-st {
  color: var(--ui-text-muted);
  font-size: 13px;
  margin: 8px 0;
  padding: 12px 16px;
}

.al-st.er {
  color: var(--ui-danger);
}

/* In-place refresh indicator (shown while the old rows stay visible). */
.al-refreshing {
  color: var(--ui-text-muted);
  font-size: 12px;
  margin: 6px 0;
  text-align: right;
  animation: al-pulse 1.2s ease-in-out infinite;
}

@keyframes al-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

/* Table stays mounted during reload; dimmed to signal the refresh. */
.al-table--loading {
  opacity: 0.55;
  transition: opacity 0.15s ease;
}

/* Table */
.al-table {
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--ui-surface);
}

.al-row {
  display: grid;
  grid-template-columns: 1.6fr 1.9fr 1.1fr 1.5fr 0.6fr 0.9fr 1.2fr 1fr;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--ui-text);
  border-top: 1px solid var(--ui-border);
  cursor: pointer;
}

.al-th {
  background: var(--ui-surface-3);
  font-weight: 600;
  color: var(--ui-text-2);
  font-size: 12px;
  cursor: default;
  border-top: none;
}

/* Header cell: label + up/down sort buttons */
.al-th-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.al-sorts {
  display: inline-flex;
  flex-direction: column;
  gap: 0;
}

.al-sorts button {
  border: none;
  background: transparent;
  color: var(--ui-text-faint);
  font-size: 9px;
  line-height: 1;
  padding: 1px 2px;
  cursor: pointer;
}

.al-sorts button:hover {
  color: var(--ui-text);
}

.al-sorts button.on {
  color: var(--ui-accent);
}

/* Filter row embedded under the header */
.al-filter-row {
  background: var(--ui-surface-2);
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
  padding-top: 8px;
  padding-bottom: 8px;
  gap: 8px;
}

.al-filter {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.al-filter input,
.al-filter select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ui-border-strong);
  border-radius: 6px;
  padding: 5px 7px;
  font-size: 12px;
  color: var(--ui-text);
  background: var(--ui-surface);
}

.al-row--open {
  background: var(--ui-surface-2);
}

.al-row:hover:not(.al-th) {
  background: var(--ui-surface-2);
}

.al-ts {
  white-space: nowrap;
  color: var(--ui-text-2);
}

.al-actor {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}

.al-actor-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.al-actor-login {
  font-size: 11px;
  color: var(--ui-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.al-actor-role {
  font-size: 11px;
  color: var(--ui-text-faint);
}

/* Action badge — colored by kind */
.al-action {
  display: inline-block;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  white-space: nowrap;
}

.al-action--create {
  background: var(--ui-success-soft);
  color: var(--ui-success);
}

.al-action--update {
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
}

.al-action--delete {
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
}

.al-action--other {
  background: var(--ui-surface-3);
  color: var(--ui-text-2);
}

.al-status {
  display: inline-block;
  min-width: 34px;
  text-align: center;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 12px;
  background: var(--ui-surface-3);
  color: var(--ui-text-2);
}

/* HTTP status groups — each with its own color. */
.al-status.st-2xx {
  background: var(--ui-success-soft);
  color: var(--ui-success);
}

.al-status.st-3xx {
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
}

.al-status.st-4xx {
  background: var(--ui-warning-soft);
  color: var(--ui-warning);
}

.al-status.st-5xx {
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
}

.al-ip {
  font-family: var(--ui-font-mono, monospace);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Expanded detail */
.al-detail {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 4px 4px;
  cursor: default;
}

.al-detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.al-detail-meta code {
  font-size: 12px;
  color: var(--ui-text-2);
  background: var(--ui-surface-3);
  padding: 3px 8px;
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.al-method {
  font-size: 12px;
  font-weight: 700;
  border-radius: 6px;
  padding: 2px 8px;
}

.m-post {
  background: var(--ui-success-soft);
  color: var(--ui-success);
}

.m-put {
  background: var(--ui-warning-soft);
  color: var(--ui-warning);
}

.m-del {
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
}

.al-detail-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.al-detail-col pre {
  background: var(--ui-surface-3);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  line-height: 1.45;
  overflow-x: auto;
  max-height: 260px;
  overflow-y: auto;
  color: var(--ui-text-2);
  margin: 0;
}

.al-detail-title {
  font-size: 11px;
  color: var(--ui-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

/* Pagination */
.al-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 14px;
  font-size: 13px;
  color: var(--ui-text-2);
}

.al-pager button {
  border: 1px solid var(--ui-border-strong);
  background: var(--ui-surface);
  color: var(--ui-text);
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
}

.al-pager button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>