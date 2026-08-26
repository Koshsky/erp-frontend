<script setup lang="ts">
/**
 * Права доступа — редактор матрицы ролей.
 * Источник истины — бэкенд (/api/v1/rbac/*): матрица грузится с сервера,
 * правки пишутся сразу (upsert правил; «нет доступа» = мягкое удаление).
 * Операции online-only (админ-страница, outbox не используется).
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ConfirmDialog } from '../components/common'
import { useRbacStore } from '../store'
import { useConfirm } from '../composables/useConfirm'

const rbac = useRbacStore()
const { roles, rules, matrix, routePolicies, loading, error } = storeToRefs(rbac)

/** Коды ресурсов и действий в порядке отображения (зеркалит кодеки бэкенда). */
const RESOURCE_ORDER = [
  'project',
  'process',
  'task',
  'milestone',
  'assignment',
  'comment',
  'state',
  'resource',
  'worker',
  'user_catalog',
  'rbac_config',
] as const

const RESOURCE_LABELS: Record<string, string> = {
  project: 'Проекты',
  process: 'Процессы',
  task: 'Задачи',
  milestone: 'Вехи',
  assignment: 'Назначения ресурсов',
  comment: 'Комментарии к задачам',
  state: 'Статусы',
  resource: 'Ресурсы табеля',
  worker: 'Сотрудники',
  user_catalog: 'Каталог пользователей (пикеры)',
  rbac_config: 'Администрирование (RBAC / автосоздание)',
}

const ACTION_ORDER = ['view', 'create', 'update', 'delete'] as const

const ACTION_LABELS: Record<string, string> = {
  view: 'Просмотр',
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
}

/** Зоны доступа: заглушка «нет доступа» не хранится (отсутствие строки = нет). */
const SCOPE_LABELS: Record<string, string> = {
  all: 'все',
  own: 'свои',
  parent: 'родитель',
  ancestor: 'предок',
  none: 'нет доступа',
}

/**
 * Применимость зон по ресурсу — зеркало policies.ScopeApplicable на бэкенде
 * (backend/policies/policies.go). Дублируется для UX: недоступные варианты
 * не показываем в селекте; бэкенд всё равно валидирует (400 на записи).
 */
const OWN_APPLICABLE = ['project', 'process', 'resource', 'worker']
const PARENT_APPLICABLE = ['process', 'task', 'milestone', 'assignment']
const ANCESTOR_APPLICABLE = ['task', 'milestone', 'assignment']

function applicableScopes(resource: string): string[] {
  const out = ['none', 'all']
  if (OWN_APPLICABLE.includes(resource)) out.push('own')
  if (PARENT_APPLICABLE.includes(resource)) out.push('parent')
  if (ANCESTOR_APPLICABLE.includes(resource)) out.push('ancestor')
  return out
}

/** Ключ ячейки: роль | ресурс | действие. */
function cellKey(role: string, resource: string, action: string): string {
  return `${role}|${resource}|${action}`
}

/** Эффективная зона ячейки из матрицы (''/не найдено = нет доступа). */
const effective = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const cell of matrix.value) {
    if (!cell.role || !cell.resource || !cell.action || !cell.scope) continue
    map[cellKey(cell.role, cell.resource, cell.action)] = cell.scope
  }
  return map
})

/** id правила для удаления (зона «нет доступа»). */
const ruleIdByCell = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  for (const rule of rules.value) {
    if (rule.id == null) continue
    map[cellKey(rule.role ?? '', rule.resource ?? '', rule.action ?? '')] = rule.id
  }
  return map
})

/** Колонки ролей: admin (инвариант, не редактируется) + роли из каталога. */
const roleColumns = computed<{ key: string; label: string }[]>(() => {
  const cols: { key: string; label: string }[] = [{ key: 'admin', label: 'Админ' }]
  for (const r of roles.value) {
    if (r.name === 'admin') continue
    cols.push({ key: r.name ?? '', label: r.name ?? '' })
  }
  return cols
})

/** Изменённые ячейки (staged кеширует выбор до сохранения). */
const staged = reactive<Record<string, string>>({})
const dirtyKeys = computed<string[]>(() =>
  Object.keys(staged).filter((key) => staged[key] !== (effective.value[key] ?? 'none')),
)

function cellValue(role: string, resource: string, action: string): string {
  const key = cellKey(role, resource, action)
  return staged[key] ?? effective.value[key] ?? 'none'
}

function onCellChange(role: string, resource: string, action: string, value: string) {
  staged[cellKey(role, resource, action)] = value
}

interface SaveMsg {
  ok: boolean
  text: string
}
const saveMsg = ref<SaveMsg | null>(null)

/** Сохраняет изменённые ячейки: 'все/свои/родитель/предок' → upsert, 'нет' → delete. */
async function save() {
  const keys = dirtyKeys.value
  if (!keys.length || rbac.saving) return
  rbac.saving = true
  saveMsg.value = null
  const failures: string[] = []
  for (const key of keys) {
    const [role, resource, action] = key.split('|')
    const scope = staged[key]
    let ok: boolean
    if (scope === 'none') {
      const id = ruleIdByCell.value[key]
      ok = id != null ? await rbac.deleteRule(id) : true
    } else {
      ok = await rbac.upsertRule({ role, resource, action, scope })
    }
    if (!ok) {
      failures.push(`${role} · ${RESOURCE_LABELS[resource] ?? resource} · ${ACTION_LABELS[action] ?? action}`)
    }
  }
  await rbac.reloadRules()
  rbac.saving = false
  if (failures.length) {
    saveMsg.value = { ok: false, text: `Не сохранилось: ${failures.join('; ')}` }
    return
  }
  for (const key of keys) delete staged[key]
  saveMsg.value = { ok: true, text: 'Права обновлены и применены' }
}

/** Отмена всех несохранённых изменений. */
function cancelDirty() {
  for (const key of dirtyKeys.value) delete staged[key]
  saveMsg.value = null
}

// Сброс к дефолтам бэкенда.
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()
function onReset() {
  ask('Вернуть все правила и маршрутные проверки к значениям по умолчанию?', () => {
    void (async () => {
      saveMsg.value = (await rbac.resetRbac())
        ? { ok: true, text: 'Права сброшены к значениям по умолчанию' }
        : { ok: false, text: error.value ?? 'Не удалось сбросить права' }
    })()
  }, 'Сбросить')
}

/** Генерация сводки по ролям из живой матрицы (всегда актуальна после правок). */
interface RoleSummaryEntry {
  resource: string
  action: string
  scope: string
}
interface RoleSummary {
  key: string
  label: string
  entries: RoleSummaryEntry[]
}
const roleSummaries = computed<RoleSummary[]>(() => {
  const byRole = new Map<string, RoleSummaryEntry[]>()
  for (const cell of matrix.value) {
    if (!cell.role || !cell.resource || !cell.action || !cell.scope) continue
    const list = byRole.get(cell.role) ?? []
    list.push({ resource: cell.resource, action: cell.action, scope: cell.scope })
    byRole.set(cell.role, list)
  }
  const sortEntries = (a: RoleSummaryEntry, b: RoleSummaryEntry) =>
    RESOURCE_ORDER.indexOf(a.resource as (typeof RESOURCE_ORDER)[number]) -
      RESOURCE_ORDER.indexOf(b.resource as (typeof RESOURCE_ORDER)[number]) ||
    ACTION_ORDER.indexOf(a.action as (typeof ACTION_ORDER)[number]) -
      ACTION_ORDER.indexOf(b.action as (typeof ACTION_ORDER)[number])

  const out: RoleSummary[] = [{ key: 'admin', label: 'Админ', entries: [] }]
  for (const r of roles.value) {
    if (r.name === 'admin') continue
    out.push({ key: r.name ?? '', label: r.name ?? '', entries: (byRole.get(r.name ?? '') ?? []).sort(sortEntries) })
  }
  return out
})

onMounted(() => {
  if (!rules.value.length && !loading.value) {
    void rbac.loadRbac()
  }
})
</script>

<template>
  <section class="pm">
    <div class="pm-head">
      <h2 class="pm-title">Права доступа</h2>
      <p class="pm-note">
        Матрица хранится на бэкенде и применяется ко всем операциям, включая листинги
        (зоны «все / свои / родитель / предок»). Изменения применяются сразу; на других
        сессиях — в пределах TTL (до 30 секунд).
      </p>
    </div>

    <p v-if="loading && !rules.length" class="pm-load">Загрузка...</p>
    <p v-if="error && !rules.length" class="pm-load er">{{ error }}</p>

    <div v-if="rules.length" class="pm-body">
      <div class="pm-toolbar">
        <span v-if="dirtyKeys.length" class="pm-dirty">Изменено ячеек: {{ dirtyKeys.length }}</span>
        <button type="button" class="pm-btn primary" :disabled="!dirtyKeys.length || rbac.saving" @click="save">
          {{ rbac.saving ? 'Сохранение...' : 'Сохранить изменения' }}
        </button>
        <button type="button" class="pm-btn" :disabled="!dirtyKeys.length || rbac.saving" @click="cancelDirty">Отменить</button>
        <span class="pm-spacer" />
        <button type="button" class="pm-btn danger" :disabled="rbac.saving" @click="onReset">Сбросить к дефолтам</button>
      </div>
      <p v-if="saveMsg" class="pm-save-msg" :class="{ er: !saveMsg.ok }">{{ saveMsg.text }}</p>

      <h3 class="pm-section-title">Матрица операций</h3>
      <p class="pm-hint">
        «Админ» — полный доступ (инвариант в коде) и не редактируется. Виртуальные ресурсы:
        «Каталог пользователей» — доступ к пикерам имён, «Администрирование» — к разделам RBAC/автосоздания.
      </p>
      <div v-for="resource in RESOURCE_ORDER" :key="resource" class="pm-block">
        <h4 class="pm-entity">{{ RESOURCE_LABELS[resource] }}</h4>
        <div class="table" :style="{ gridTemplateColumns: `220px repeat(${roleColumns.length}, 1fr)` }">
          <div class="tr th">
            <div class="pm-action">Действие</div>
            <div v-for="col in roleColumns" :key="col.key" class="pm-role" :title="col.label">{{ col.label }}</div>
          </div>
          <div v-for="action in ACTION_ORDER" :key="action" class="tr">
            <div class="pm-action">{{ ACTION_LABELS[action] }}</div>
            <div v-for="col in roleColumns" :key="col.key" class="pm-cell">
              <span v-if="col.key === 'admin'" class="pm-fixed">все</span>
              <select
                v-else
                class="pm-select"
                :value="cellValue(col.key, resource, action)"
                :class="{ dirty: staged[cellKey(col.key, resource, action)] && staged[cellKey(col.key, resource, action)] !== (effective[cellKey(col.key, resource, action)] ?? 'none') }"
                @change="onCellChange(col.key, resource, action, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="s in applicableScopes(resource)" :key="s" :value="s">{{ SCOPE_LABELS[s] }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <details class="pm-routes">
        <summary class="pm-routes-summary">
          Маршрутные проверки (read-only: name → kind и параметры)
        </summary>
        <div class="table">
          <div class="tr th" :style="{ gridTemplateColumns: '200px 110px 1fr' }">
            <div>Имя</div>
            <div>Kind</div>
            <div>Параметры</div>
          </div>
          <div v-for="p in routePolicies" :key="p.name" class="tr" :style="{ gridTemplateColumns: '200px 110px 1fr' }">
            <div class="pm-route-name">{{ p.name }}</div>
            <div class="pm-route-kind">{{ p.kind }}</div>
            <div class="pm-route-params">{{ JSON.stringify(p.params ?? {}) }}</div>
          </div>
        </div>
      </details>

      <h3 class="pm-section-title">Сводка по ролям</h3>
      <p class="pm-hint">Сформирована из текущей матрицы — после правок обновляется автоматически.</p>
      <div class="pm-roles">
        <div v-for="role in roleSummaries" :key="role.key" class="pm-role-card">
          <div class="pm-role-head">
            <span class="pm-role-name">{{ role.label }}</span>
            <span class="pm-role-key">{{ role.key }}</span>
          </div>
          <p v-if="role.key === 'admin'" class="pm-role-desc">
            Полный доступ ко всем операциям и листингам — защитный инвариант в коде, не редактируется.
          </p>
          <ul v-else class="pm-role-list">
            <li v-for="e in role.entries" :key="`${e.resource}-${e.action}`" class="pm-role-item">
              <span class="pm-role-item-title">{{ RESOURCE_LABELS[e.resource] ?? e.resource }} — {{ ACTION_LABELS[e.action] ?? e.action }}</span>
              <span class="pm-role-item-desc">{{ SCOPE_LABELS[e.scope] ?? e.scope }}</span>
            </li>
            <li v-if="!role.entries.length" class="pm-role-item">
              <span class="pm-role-item-desc">нет доступа</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="!!confirmDialog"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      @confirm="proceed"
      @close="cancel"
    />
  </section>
</template>

<style scoped>
.pm-head {
  margin-bottom: 16px;
}
.pm-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 6px;
}
.pm-note {
  color: #666;
  font-size: 13px;
  margin: 0;
  max-width: 900px;
  line-height: 1.5;
}
.pm-load {
  color: #888;
  font-size: 13px;
}
.pm-load.er {
  color: #c0392b;
}
.pm-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pm-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.pm-dirty {
  font-size: 12.5px;
  color: #8a6d1a;
  background: #fdf6e3;
  border: 1px solid #ead9a8;
  border-radius: 999px;
  padding: 3px 12px;
}
.pm-spacer {
  flex: 1;
}
.pm-btn {
  font-size: 13px;
  font-weight: 600;
  border: 1px solid #cdd5e1;
  background: #fff;
  color: #2c3e50;
  border-radius: 8px;
  padding: 7px 14px;
  cursor: pointer;
}
.pm-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.pm-btn.primary {
  background: #1a3a6b;
  border-color: #1a3a6b;
  color: #fff;
}
.pm-btn.danger {
  color: #c0392b;
  border-color: #e6b8b3;
}
.pm-save-msg {
  font-size: 13px;
  color: #1d6b2f;
  margin: 2px 0 8px;
}
.pm-save-msg.er {
  color: #c0392b;
}
.pm-section-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a3a6b;
  margin: 18px 0 8px;
}
.pm-hint {
  font-size: 12.5px;
  color: #777;
  margin: 0 0 10px;
  max-width: 900px;
  line-height: 1.5;
}
.pm-block {
  margin-bottom: 18px;
}
.pm-entity {
  font-size: 15px;
  font-weight: 700;
  color: #1a3a6b;
  margin: 0 0 8px;
}
.table {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: block;
}
.tr {
  display: grid;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13.5px;
  align-items: center;
}
.tr:last-child {
  border-bottom: none;
}
.tr:not(.th):hover {
  background: #f6f8fa;
}
.th {
  background: #f8f9fa;
  font-weight: 600;
  color: #555;
}
.pm-action {
  font-weight: 500;
  color: #2c3e50;
}
.pm-role {
  text-align: center;
  color: #444;
  font-size: 12.5px;
}
.pm-cell {
  text-align: center;
}
.pm-fixed {
  color: #999;
  font-size: 13px;
}
.pm-select {
  width: 100%;
  max-width: 170px;
  font-size: 13px;
  padding: 4px 6px;
  border: 1px solid #cdd5e1;
  border-radius: 6px;
  background: #fff;
  color: #2c3e50;
  cursor: pointer;
}
.pm-select.dirty {
  border-color: #e8b10a;
  background: #fffbe6;
}
.pm-routes {
  margin: 10px 0 4px;
  border: 1px solid #e4e8ef;
  border-radius: 10px;
  background: #fbfcfe;
  padding: 10px 14px;
}
.pm-routes-summary {
  font-size: 13.5px;
  font-weight: 600;
  color: #1a3a6b;
  cursor: pointer;
}
.pm-route-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
}
.pm-route-kind {
  font-size: 12.5px;
  color: #555;
}
.pm-route-params {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #666;
  word-break: break-all;
}
.pm-roles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}
.pm-role-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pm-role-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.pm-role-name {
  font-size: 16px;
  font-weight: 700;
  color: #2c3e50;
}
.pm-role-key {
  font-size: 11px;
  font-weight: 600;
  color: #7a8699;
  background: #f1f4f9;
  border-radius: 999px;
  padding: 2px 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.pm-role-desc {
  margin: 0;
  font-size: 13px;
  color: #555;
  line-height: 1.45;
}
.pm-role-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pm-role-item {
  border-top: 1px solid #f0f0f0;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pm-role-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a3a6b;
}
.pm-role-item-desc {
  font-size: 12.5px;
  color: #666;
  line-height: 1.4;
}
</style>