<script setup lang="ts">
/**
 * Журнал действий (audit log) — админ-страница: все CRUD-мутации и события
 * авторизации, зафиксированные на сервере в Grafana Loki. Данные читаются
 * через ERP API (/audit/events). Фильтры встроены в шапку таблицы, каждая
 * колонка сортируется (вверх/вниз), причём сортировка применяется к текущей
 * странице (Loki отдаёт страницы без глобальной сортировки по полям).
 */
import { HintButton, DataTable } from '../components/common'
import type { DataTableColumn } from '../components/common'
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuditStore } from '../store'
import { useColumnWidths } from '../composables/useColumnWidths'
import type { DtoAuditEventView } from '@/api'

const audit = useAuditStore()
const { items, loading, error, disabled } = storeToRefs(audit)

/**
 * The DataTable cell slot gives the row as `unknown` (generic inference does
 * not reach through the store's refs) — cast to the page's row type here.
 */
const asEv = (row: unknown): DtoAuditEventView => row as DtoAuditEventView

/** Table columns; sorting lives inside DataTable (values via sortValue). */
const columns: DataTableColumn[] = [
  { key: 'ts', label: 'Время', width: 'fit-content(230px)' },
  { key: 'actor', label: 'Пользователь', width: 'fit-content(340px)' },
  { key: 'entity', label: 'Сущность', width: 'fit-content(230px)' },
  { key: 'action', label: 'Действие', width: 'fit-content(240px)' },
  { key: 'id', label: 'ID', width: '70px' },
  { key: 'status', label: 'Статус', width: 'fit-content(180px)' },
  { key: 'ip', label: 'IP', width: 'fit-content(230px)' },
  { key: 'duration', label: 'Время, мс', width: 'fit-content(170px)' },
]

/** Per-user persisted column widths (drag-resize on the header edges). */
const { columnWidths } = useColumnWidths('audit')

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
  auto_create: 'Триггер создания проекта',
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
  create_preset: 'Создание пресета',
  update_preset: 'Изменение пресета',
  delete_preset: 'Удаление пресета',
  upsert_preset_rule: 'Изменение правила пресета',
  delete_preset_rule: 'Удаление правила пресета',
  replace_user_permissions: 'Замена прав пользователя',
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
  rbac: ['create_preset', 'update_preset', 'delete_preset', 'upsert_preset_rule', 'delete_preset_rule', 'upsert_policy', 'delete_policy', 'replace_user_permissions', 'reset'],
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
  create: 'create', add: 'create', create_preset: 'create',
  update: 'update', update_manager: 'update', reorder: 'update',
  set_days: 'update', upsert_preset_rule: 'update', upsert_policy: 'update', replace_user_permissions: 'update',
  reset_password: 'update', change_password: 'update', reset: 'update',
  delete: 'delete', remove: 'delete', delete_days: 'delete',
  delete_preset_rule: 'delete', delete_preset: 'delete', delete_policy: 'delete',
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

/**
 * Sort values for the DataTable: ts is a timestamp, actor prefers the full
 * name, id and status/duration are numbers (default row[col.key] would not
 * match these semantics). The sort state itself lives inside DataTable
 * (default: newest first).
 */
function sortValue(ev: DtoAuditEventView, key: string): number | string {
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
    default:
      return String((ev as unknown as Record<string, unknown>)[key] ?? '')
  }
}

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
    <p v-if="loading && !items.length" class="al-st">Загрузка...</p>
    <p v-if="loading && items.length" class="al-refreshing">Обновление…</p>
    <p v-if="error" class="al-st er">{{ error }}</p>

    <!-- The backend does not expose /audit/events (audit.enabled=false):
         a distinct help card instead of the table / a raw 404 error. -->
    <div v-if="disabled" class="al-disabled" role="note">
      <h3 class="al-disabled-title">Журнал действий отключён на сервере</h3>
      <ol class="al-disabled-steps">
        <li>в config.yaml бэкенда установите <code>audit.enabled: true</code>;</li>
        <li>перезапустите backend (<code>docker restart erp</code> или <code>docker compose up -d</code>);</li>
        <li>обновите страницу.</li>
      </ol>
    </div>

    <!-- Table: toolbar (search/reload), sortable headers, embedded filter row,
         expandable rows with request/response details. Never unmounts while
         data is present: during a filter-triggered reload the previous rows
         stay visible (dimmed) until the new ones arrive. -->
    <DataTable
      v-if="!disabled && (items.length > 0 || (!loading && !error))"
      :columns="columns"
      :rows="items"
      title="Журнал действий"
      expandable
      resizable
      v-model:column-widths="columnWidths"
      :sort-value="sortValue"
      :default-sort="{ key: 'ts', dir: -1 }"
      empty-text="Нет записей"
      :class="{ 'al-table--loading': loading && items.length > 0 }"
    >
      <template #actions>
        <HintButton hint="audit" />
        <input
          v-model="filters.search"
          class="al-search"
          type="text"
          placeholder="Поиск по строке события..."
          @keyup.enter="applyFilters(0)"
        />
        <button type="button" class="al-btn" :disabled="loading" @click="applyFilters(offset)">Обновить</button>
        <button type="button" class="al-btn" @click="resetFilters">Сбросить</button>
      </template>

      <!-- Per-column filters, aligned with the columns via shared tracks -->
      <template #filters>
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
      </template>

      <template #cell="{ row, column }">
        <template v-if="column.key === 'ts'"><span class="al-ts">{{ formatTS(asEv(row).ts) }}</span></template>
        <template v-else-if="column.key === 'actor'">
          <span class="al-actor">
            <span class="al-actor-name">{{ actorName(asEv(row)) }}</span>
            <!-- Login on its own line only when a separate full name is shown
                 (prevents the "admin / admin" duplication). -->
            <span v-if="asEv(row).actor_name && asEv(row).actor_email && asEv(row).actor_email !== asEv(row).actor_name" class="al-actor-login">{{ asEv(row).actor_email }}</span>
            <span v-if="asEv(row).actor_role" class="al-actor-role">{{ asEv(row).actor_role }}</span>
          </span>
        </template>
        <template v-else-if="column.key === 'entity'">{{ entityLabel(asEv(row).entity ?? '') }}</template>
        <template v-else-if="column.key === 'action'">
          <span class="al-action" :class="`al-action--${actionKindOf(asEv(row).action)}`">
            {{ actionLabel(asEv(row).action ?? '') }}
          </span>
        </template>
        <template v-else-if="column.key === 'id'">{{ asEv(row).entity_id ?? asEv(row).actor_user_id ?? '—' }}</template>
        <template v-else-if="column.key === 'status'"><span class="al-status" :class="statusClass(asEv(row).status)">{{ asEv(row).status }}</span></template>
        <template v-else-if="column.key === 'ip'"><span class="al-ip">{{ asEv(row).actor_ip || '—' }}</span></template>
        <template v-else>{{ asEv(row).duration_ms ?? '—' }}</template>
      </template>

      <!-- Expanded detail: method + path + raw request/response JSON -->
      <template #expanded="{ row }">
        <div class="al-detail">
          <div class="al-detail-meta">
            <span class="al-method" :class="methodClass(asEv(row).method)">{{ asEv(row).method }}</span>
            <code>{{ asEv(row).path }}</code>
          </div>
          <div class="al-detail-cols">
            <div class="al-detail-col">
              <div class="al-detail-title">Тело запроса</div>
              <pre>{{ prettyJSON(asEv(row).request_body) }}</pre>
            </div>
            <div class="al-detail-col">
              <div class="al-detail-title">Тело ответа</div>
              <pre>{{ prettyJSON(asEv(row).response_body) }}</pre>
            </div>
          </div>
        </div>
      </template>
    </DataTable>

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

/* Toolbar controls (rendered inside the DataTable actions slot) */
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

/* Help card when the backend does not expose the audit journal
   (audit.enabled=false): muted/neutral, tokens only. */
.al-disabled {
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface-2);
  padding: 20px 24px;
  max-width: 560px;
  color: var(--ui-text-2);
}

.al-disabled-title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ui-text);
}

.al-disabled-steps {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.al-disabled-steps code {
  font-family: var(--ui-font-mono, monospace);
  font-size: 12px;
  background: var(--ui-surface-3);
  border-radius: 5px;
  padding: 1px 6px;
  color: var(--ui-text-2);
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

/* Filter cells — aligned with the columns via the DataTable filter row */
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 20px;
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