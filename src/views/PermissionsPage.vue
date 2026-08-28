<script setup lang="ts">
/**
 * Access permissions — a role-centric editor.
 * Roles on the left, capabilities of the selected role by section on the right.
 * Scopes are rendered in human language in the resource context
 * ("in own processes", "in own projects", "own only", "all").
 * Source of truth — the matrix on the backend (/api/v1/rbac/*); edits are
 * applied immediately (upsert; "no access" = soft delete).
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ConfirmDialog } from '../components/common'
import { useRbacStore } from '../store'
import { useConfirm } from '../composables/useConfirm'

const rbac = useRbacStore()
const { roles, rules, matrix, routePolicies, loading, error, saving } = storeToRefs(rbac)

/** Selected role (by default — the first one from the catalog, not admin). */
const selected = ref('')

/** Resource and action codes (mirror the backend codecs). */
const ACTION_LABELS: Record<string, string> = {
  view: 'Просмотр',
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
}

// Resource → human-readable name (genitive case for phrases like "View …").
const RESOURCE_LABELS: Record<string, string> = {
  project: 'проектов',
  process: 'процессов',
  task: 'задач',
  milestone: 'вех',
  assignment: 'назначений ресурсов',
  state: 'статусов',
  resource: 'ресурсов табеля',
  worker: 'сотрудников',
  user_catalog: 'каталога пользователей',
  rbac_config: 'настроек администрирования',
}

/** Entity names (nominative) for the collapsible group headers. */
const ENTITY_NAMES: Record<string, string> = {
  project: 'Проекты',
  process: 'Процессы',
  task: 'Задачи',
  milestone: 'Вехи',
  assignment: 'Назначения ресурсов',
  state: 'Статусы',
  resource: 'Ресурсы табеля',
  worker: 'Сотрудники',
  user_catalog: 'Каталог пользователей',
  rbac_config: 'Настройки администрирования',
}

/** Collapsed by default; the header click expands/collapses an entity group */
const openEntities = ref<Set<string>>(new Set())

function isOpen(resource: string): boolean {
  return openEntities.value.has(resource)
}

function toggleGroup(resource: string) {
  const next = new Set(openEntities.value)
  if (next.has(resource)) next.delete(resource)
  else next.add(resource)
  openEntities.value = next
}

/**
 * Available scopes with human-readable labels in the resource context.
 * The scope set mirrors policies.ScopeApplicable on the backend; the wording
 * itself explains the owner ("in own processes" = process owner, etc.).
 */
const SCOPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  project: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'own', label: 'Только свои' },
    { value: 'all', label: 'Все' },
  ],
  process: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'own', label: 'Только своё' },
    { value: 'parent', label: 'В своих проектах' },
    { value: 'ancestor', label: 'Свои и в своих проектах' },
    { value: 'all', label: 'Все' },
  ],
  task: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'own', label: 'Только своё' },
    { value: 'parent', label: 'В своих процессах' },
    { value: 'ancestor', label: 'Свои и в своих процессах/проектах' },
    { value: 'all', label: 'Все' },
  ],
  milestone: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'parent', label: 'В своих процессах' },
    { value: 'ancestor', label: 'Свои и в своих процессах/проектах' },
    { value: 'all', label: 'Все' },
  ],
  assignment: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'parent', label: 'В своих процессах' },
    { value: 'ancestor', label: 'Свои и в своих процессах/проектах' },
    { value: 'all', label: 'Все' },
  ],
  state: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'all', label: 'Всё' },
  ],
  resource: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'own', label: 'Только свои' },
    { value: 'all', label: 'Все' },
  ],
  worker: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'own', label: 'Только свои (подчинённые)' },
    { value: 'all', label: 'Все' },
  ],
  user_catalog: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'all', label: 'Доступен' },
  ],
  rbac_config: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'all', label: 'Доступен' },
  ],
}

/** Page sections. */
const GROUPS = [
  { key: 'planning', title: 'Планирование', resources: ['project', 'process', 'task', 'milestone', 'assignment'] },
  { key: 'timesheet', title: 'Табель', resources: ['state', 'resource', 'worker'] },
  { key: 'advanced', title: 'Дополнительные ресурсы', resources: ['user_catalog', 'rbac_config'] },
] as const

const ACTIONS = ['view', 'create', 'update', 'delete'] as const

/** Effective cell scope from the matrix (no rule = "no access"). */
const effective = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const cell of matrix.value) {
    if (!cell.role || !cell.resource || !cell.action || !cell.scope) continue
    map[cellKey(cell.role, cell.resource, cell.action)] = cell.scope
  }
  return map
})

/** Rule id for deletion. */
const ruleIdByCell = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  for (const rule of rules.value) {
    if (rule.id == null) continue
    map[cellKey(rule.role ?? '', rule.resource ?? '', rule.action ?? '')] = rule.id
  }
  return map
})

function cellKey(role: string, resource: string, action: string): string {
  return `${role}|${resource}|${action}`
}

function cellValue(role: string, resource: string, action: string): string {
  return staged[cellKey(role, resource, action)] ?? effective.value[cellKey(role, resource, action)] ?? 'none'
}

/** Human-readable scope label in the resource context. */
function scopeLabel(resource: string, scope: string): string {
  const opt = SCOPE_OPTIONS[resource]?.find((o) => o.value === scope)
  return opt?.label ?? 'Нет доступа'
}

/** Human-readable names of known roles (the DB catalog keeps descriptions in English). */
const ROLE_TITLES: Record<string, string> = {
  admin: 'Администратор',
  dp: 'Директор проектов',
  rp: 'Руководитель проекта',
  vp: 'Владелец процесса',
  worker: 'Работник',
}

function roleTitle(code: string): string {
  return ROLE_TITLES[code] ?? code
}

/** Role list: admin + catalog (no duplicates). */
const roleList = computed(() => {
  const names = ['admin']
  for (const r of roles.value) {
    if (r.name && !names.includes(r.name)) names.push(r.name)
  }
  return names
})

const isAdminSelected = computed(() => selected.value === 'admin')

/** Changed cells. */
const staged = reactive<Record<string, string>>({})
const dirtyKeys = computed<string[]>(() =>
  Object.keys(staged).filter((key) => staged[key] !== (effective.value[key] ?? 'none')),
)

/** Change descriptions for the save bar. */
const dirtyChanges = computed(() =>
  dirtyKeys.value.map((key) => {
    const [role, resource, action] = key.split('|')
    const from = effective.value[key] ?? 'none'
    const to = staged[key]
    return `${ACTION_LABELS[action] ?? action} ${RESOURCE_LABELS[resource] ?? resource}: ${scopeLabel(resource, to)}${from !== 'none' ? ` (было: ${scopeLabel(resource, from)})` : ''}`
  }),
)

function onCellChange(resource: string, action: string, value: string) {
  staged[cellKey(selected.value, resource, action)] = value
}

interface SaveMsg {
  ok: boolean
  text: string
}
const saveMsg = ref<SaveMsg | null>(null)

async function save() {
  const keys = dirtyKeys.value
  if (!keys.length || saving.value) return
  saving.value = true
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
      failures.push(`${role} · ${ACTION_LABELS[action] ?? action} ${RESOURCE_LABELS[resource] ?? resource}`)
    }
  }
  await rbac.reloadRules()
  saving.value = false
  if (failures.length) {
    saveMsg.value = { ok: false, text: `Не сохранилось: ${failures.join('; ')}` }
    return
  }
  for (const key of keys) delete staged[key]
  saveMsg.value = { ok: true, text: 'Права обновлены и применены' }
}

function cancelDirty() {
  for (const key of dirtyKeys.value) delete staged[key]
  saveMsg.value = null
}

// Reset to defaults.
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

// === Role management (catalog) ===
const newRoleName = ref('')
const newRoleDesc = ref('')
const roleMsg = ref<{ ok: boolean; text: string } | null>(null)

async function onCreateRole() {
  const name = newRoleName.value.trim()
  if (!name) {
    roleMsg.value = { ok: false, text: 'Укажите имя роли (латиница, цифры, «-», «_»)' }
    return
  }
  const ok = await rbac.createRole({ name, description: newRoleDesc.value.trim() })
  roleMsg.value = ok ? { ok: true, text: 'Роль создана' } : { ok: false, text: error.value ?? 'Не удалось создать роль' }
  if (ok) {
    newRoleName.value = ''
    newRoleDesc.value = ''
  }
}

async function onUpdateRoleDesc(roleName: string) {
  const desc = window.prompt('Новое описание роли', rbac.roles.find((r) => r.name === roleName)?.description ?? '')
  if (desc == null) return
  const ok = await rbac.updateRole(roleName, desc.trim())
  roleMsg.value = ok ? { ok: true, text: 'Описание обновлено' } : { ok: false, text: 'Не удалось обновить описание' }
}

function onDeleteRole(roleName: string) {
  if (roleName === 'admin') return
  ask(
    'Удалить роль «' + roleName + '»? Назначенные пользователи сохранятся, но потеряют права этой роли; правила роли будут удалены.',
    () => {
      void (async () => {
        const ok = await rbac.deleteRole(roleName)
        roleMsg.value = ok ? null : { ok: false, text: 'Не удалось удалить роль' }
      })()
    },
    'Удалить роль',
  )
}

function onReset() {
  ask('Вернуть все права и маршрутные проверки к значениям по умолчанию?', () => {
    void (async () => {
      saveMsg.value = (await rbac.resetRbac())
        ? { ok: true, text: 'Права сброшены к значениям по умолчанию' }
        : { ok: false, text: error.value ?? 'Не удалось сбросить права' }
    })()
  }, 'Сбросить')
}

/** Select the default role after the catalog is loaded. */
watch(roleList, (list) => {
  if ((!selected.value || !list.includes(selected.value)) && list.length) {
    selected.value = list[0] === 'admin' ? (list[1] ?? 'admin') : list[0]
  }
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
        Выберите роль — ниже показано, что она умеет. Правки применяются сразу; на других
        сессиях — в пределах TTL (до 30 секунд). «Только своё» — записи, владельцем
        которых является сам пользователь; «Свои и в своих…» — владелец записи или
        любой из вышестоящих по цепочке (для задач — владелец задачи, процесса или
        проекта).
      </p>
    </div>

    <p v-if="loading && !rules.length" class="pm-load">Загрузка...</p>
    <p v-if="error && !rules.length" class="pm-load er">{{ error }}</p>

    <div v-if="rules.length && roleList.length" class="pm-layout">
      <!-- Roles -->
      <nav class="pm-roles">
        <button
          v-for="role in roleList"
          :key="role"
          type="button"
          class="pm-role-btn"
          :class="{ active: role === selected }"
          @click="selected = role"
        >
          <span class="pm-role-code">{{ role }}</span>
          <span class="pm-role-name">
            {{ roleTitle(role) }}
          </span>
          <span v-if="role === 'admin'" class="pm-role-lock" title="Полный доступ — инвариант в коде, не редактируется">заблокировано</span>
        </button>
      </nav>

      <!-- Editor of the selected role -->
      <div class="pm-editor">
        <div v-if="isAdminSelected" class="pm-admin-note">
          Администратор имеет полный доступ ко всем операциям и листингам — это защитный
          инвариант в коде, значения не редактируются.
        </div>

        <template v-if="!isAdminSelected">
          <div v-for="group in GROUPS" :key="group.key" class="pm-group">
            <h3 class="pm-group-title">{{ group.title }}</h3>
            <div v-for="resource in group.resources" :key="resource" class="pm-block">
              <button
                type="button"
                class="pm-entity"
                :class="{ open: isOpen(resource) }"
                :aria-expanded="isOpen(resource)"
                @click="toggleGroup(resource)"
              >
                <span class="pm-entity-caret">{{ isOpen(resource) ? '▾' : '▸' }}</span>
                <span>{{ ENTITY_NAMES[resource] ?? resource }}</span>
              </button>
              <div v-if="isOpen(resource)" class="pm-entity-body">
                <div
                  v-for="action in ACTIONS"
                  :key="action"
                  class="pm-row"
                  :class="{ dirty: staged[cellKey(selected, resource, action)] }"
                >
                  <div class="pm-row-label">{{ ACTION_LABELS[action] }} {{ RESOURCE_LABELS[resource] }}</div>
                  <select
                    class="pm-select"
                    :value="cellValue(selected, resource, action)"
                    @change="onCellChange(resource, action, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="opt in SCOPE_OPTIONS[resource]" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </div>
              </div>
            </div>
            <p v-if="group.key === 'planning'" class="pm-comment">
              Комментарии к задачам: права определяются правами на задачу — видят и добавляют их те же, кому видна задача.
            </p>
          </div>
        </template>

        <h3 class="pm-section-title">Роли</h3>
        <p class="pm-hint">
          Каталог ролей: создание даёт право назначать роль пользователям; удаление снимает
          правила роли и права назначенных пользователей (роль «admin» защищена инвариантом).
        </p>
        <div class="pm-roles-editor">
          <div class="pm-role-create">
            <input v-model="newRoleName" class="pm-input" maxlength="32" placeholder="имя роли, напр. auditor" />
            <input v-model="newRoleDesc" class="pm-input" maxlength="80" placeholder="описание" />
            <button type="button" class="pm-btn primary" @click="onCreateRole">Создать роль</button>
          </div>
          <p v-if="roleMsg" class="pm-save-msg" :class="{ er: !roleMsg.ok }">{{ roleMsg.text }}</p>
          <div class="pm-role-list">
            <div v-for="r in roles" :key="r.name" class="pm-role-editable">
              <div class="pm-role-editable-main">
                <span class="pm-role-code">{{ r.name }}</span>
                <span class="pm-role-editable-desc">{{ r.description || '—' }}</span>
              </div>
              <div class="pm-role-editable-actions">
                <button type="button" class="pm-btn" @click="onUpdateRoleDesc(r.name ?? '')">Описание</button>
                <button type="button" class="pm-btn danger" :disabled="r.name === 'admin'" @click="onDeleteRole(r.name ?? '')" title="админ — инвариант в коде">Удалить</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Internal -->
        <details class="pm-inspect">
          <summary class="pm-inspect-summary">Служебное: маршрутные проверки (name → kind и параметры)</summary>
          <div v-for="p in routePolicies" :key="p.name" class="pm-route">
            <code class="pm-route-name">{{ p.name }}</code>
            <span class="pm-route-kind">{{ p.kind }}</span>
            <span class="pm-route-params">{{ JSON.stringify(p.params ?? {}) }}</span>
          </div>
        </details>
      </div>
    </div>

    <!-- Save bar -->
    <div v-if="dirtyKeys.length" class="pm-savebar">
      <div class="pm-savebar-info">
        <strong>Изменения ({{ dirtyKeys.length }}):</strong>
        <ul>
          <li v-for="c in dirtyChanges" :key="c">{{ c }}</li>
        </ul>
      </div>
      <div class="pm-savebar-actions">
        <button type="button" class="pm-btn primary" :disabled="saving" @click="save">{{ saving ? 'Сохранение...' : 'Сохранить' }}</button>
        <button type="button" class="pm-btn" :disabled="saving" @click="cancelDirty">Отменить</button>
        <button type="button" class="pm-btn danger" :disabled="saving" @click="onReset">Сбросить всё к дефолтам</button>
      </div>
    </div>

    <p v-if="saveMsg && !dirtyKeys.length" class="pm-save-msg" :class="{ er: !saveMsg.ok }">{{ saveMsg.text }}</p>

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
.pm-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 20px;
  align-items: start;
}
.pm-roles {
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: sticky;
  top: 16px;
}
.pm-role-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 11px 14px;
  border: 1px solid #dfe4ec;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}
.pm-role-btn:hover {
  border-color: #b7c3d6;
}
.pm-role-btn.active {
  border-color: #1a3a6b;
  background: #1a3a6b;
  color: #fff;
}
.pm-role-btn.active .pm-role-code {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}
.pm-role-code {
  font-size: 11px;
  font-weight: 700;
  background: #eef2f8;
  color: #1a3a6b;
  border-radius: 999px;
  padding: 2px 9px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  min-width: 42px;
  text-align: center;
}
.pm-role-name {
  font-weight: 600;
}
.pm-role-lock {
  margin-left: auto;
  font-size: 11px;
  color: #999;
  font-weight: 500;
}
.pm-editor {
  min-width: 0;
}
.pm-admin-note {
  background: #f2f5fa;
  border: 1px solid #e0e6f0;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 13.5px;
  color: #4a5a72;
  line-height: 1.5;
}
.pm-group {
  margin-bottom: 22px;
}
.pm-group-title {
  font-size: 15px;
  font-weight: 700;
  color: #7a8699;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px;
}
.pm-block {
  margin-bottom: 14px;
}
.pm-entity {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: #2c3e50;
  background: #f4f6f9;
  border: 1px solid #e4e9f0;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}
.pm-entity:hover {
  border-color: #b7c3d6;
}
.pm-entity-caret {
  font-size: 11px;
  color: #1a3a6b;
}
.pm-entity-body {
  padding-top: 6px;
}
.pm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 14px;
  background: #fff;
  border: 1px solid #eef1f6;
  border-radius: 8px;
  margin-bottom: 4px;
  font-size: 14px;
}
.pm-row:hover {
  border-color: #d4dce8;
}
.pm-row.dirty {
  border-color: #e8b10a;
  background: #fffbe6;
}
.pm-row-label {
  color: #2c3e50;
}
.pm-select {
  font-size: 13.5px;
  padding: 5px 8px;
  border: 1px solid #cdd5e1;
  border-radius: 6px;
  background: #fff;
  color: #2c3e50;
  cursor: pointer;
  min-width: 210px;
}
.pm-comment {
  font-size: 12.5px;
  color: #78849a;
  padding: 8px 0 8px 2px;
}
.pm-inspect {
  margin-top: 18px;
  border: 1px solid #e4e8ef;
  border-radius: 10px;
  background: #fbfcfe;
  padding: 10px 14px;
}
.pm-inspect-summary {
  font-size: 13px;
  font-weight: 600;
  color: #1a3a6b;
  cursor: pointer;
}
.pm-route {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 12.5px;
  padding: 4px 0;
  border-top: 1px solid #eef1f6;
  margin-top: 4px;
}
.pm-route-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  min-width: 190px;
}
.pm-route-kind {
  color: #555;
  min-width: 90px;
}
.pm-route-params {
  color: #666;
  word-break: break-all;
}
.pm-savebar {
  position: sticky;
  bottom: 12px;
  margin-top: 18px;
  background: #fff;
  border: 1px solid #e8b10a;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
  padding: 12px 16px;
  display: flex;
  gap: 18px;
  align-items: flex-start;
  z-index: 10;
}
.pm-savebar-info {
  flex: 1;
  font-size: 13px;
  color: #333;
}
.pm-savebar-info ul {
  margin: 6px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pm-savebar-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
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
  margin: 12px 0;
}
.pm-save-msg.er {
  color: #c0392b;
}
.pm-section-title { font-size: 18px; font-weight: 700; color: #1a3a6b; margin: 18px 0 8px; }
.pm-roles-editor { margin-bottom: 14px; }
.pm-role-create { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.pm-input { font-size: 13px; padding: 6px 10px; border: 1px solid #cdd5e1; border-radius: 6px; flex: 1; min-width: 180px; }
.pm-role-list { display: flex; flex-direction: column; gap: 6px; }
.pm-role-editable { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; background: #fff; border: 1px solid #eef1f6; border-radius: 8px; }
.pm-role-editable-main { display: flex; align-items: center; gap: 10px; min-width: 0; }
.pm-role-editable-desc { color: #666; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-role-editable-actions { display: flex; gap: 6px; flex-shrink: 0; }
</style>