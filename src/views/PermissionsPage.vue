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
const { roles, rules, matrix, loading, error, saving } = storeToRefs(rbac)

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

/** Role tabs: the catalog without the admin bypass (admin is a code invariant, not an editable tab). */
const roleList = computed(() => {
  const names: string[] = []
  for (const r of roles.value) {
    if (r.name && r.name !== 'admin' && !names.includes(r.name)) names.push(r.name)
  }
  return names
})

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

/** Role name pattern: latin letters, digits, «-», «_» (mirrors the backend codec). */
const ROLE_NAME_RE = /^[a-zA-Z0-9_-]+$/
const newRoleName = ref('')
const newRoleDesc = ref('')
const roleMsg = ref<{ ok: boolean; text: string } | null>(null)
/** Client-side validation error of the required role-name field (null = valid). */
const newRoleNameError = ref<string | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)

function failRoleName(message: string) {
  newRoleNameError.value = message
  nameInput.value?.focus()
}

/** Drop the highlight as soon as the user starts typing. */
watch(newRoleName, () => {
  newRoleNameError.value = null
})

async function onCreateRole() {
  const name = newRoleName.value.trim()
  if (!name) {
    failRoleName('Укажите имя роли (латиница, цифры, «-», «_»), описание можно не заполнять')
    return
  }
  if (!ROLE_NAME_RE.test(name)) {
    failRoleName('Имя роли: только латиница, цифры, «-», «_»')
    return
  }
  newRoleNameError.value = null
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
    selected.value = list[0]
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
        </button>
      </nav>

      <!-- Editor of the selected role -->
      <div class="pm-editor">
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
              <span class="pm-entity-caret" aria-hidden="true">▸</span>
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

        <h3 class="pm-section-title">Роли</h3>
        <p class="pm-hint">
          Каталог ролей: создание даёт право назначать роль пользователям; удаление снимает
          правила роли и права назначенных пользователей (роль «admin» защищена инвариантом).
        </p>
        <div class="pm-roles-editor">
          <div class="pm-role-create">
            <label class="pm-field">
              <span class="pm-field-label">Имя роли<span class="pm-req" title="обязательное поле">*</span></span>
              <input
                ref="nameInput"
                v-model="newRoleName"
                class="pm-input"
                :class="{ invalid: !!newRoleNameError }"
                :aria-invalid="!!newRoleNameError"
                maxlength="32"
                placeholder="имя роли, напр. auditor"
              />
            </label>
            <label class="pm-field">
              <span class="pm-field-label">Описание</span>
              <input v-model="newRoleDesc" class="pm-input" maxlength="80" placeholder="описание" />
            </label>
            <button type="button" class="pm-btn primary" @click="onCreateRole">Создать роль</button>
          </div>
          <p v-if="newRoleNameError" class="pm-field-error" role="alert">{{ newRoleNameError }}</p>
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
@import '../styles/tokens.css';

.pm-head {
  margin-bottom: 18px;
}
.pm-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 6px;
}
.pm-note {
  color: var(--ui-text-2);
  font-size: 13px;
  margin: 0;
  max-width: 900px;
  line-height: 1.55;
}
.pm-load {
  color: var(--ui-text-faint);
  font-size: 13px;
}
.pm-load.er {
  color: var(--ui-danger);
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
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface);
  cursor: pointer;
  font-size: 14px;
  color: var(--ui-text);
  transition: border-color var(--ui-duration), background var(--ui-duration);
}
.pm-role-btn:hover {
  border-color: var(--ui-border-strong);
  background: var(--ui-surface-3);
}
.pm-role-btn.active {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
  color: var(--ui-accent-on);
}
.pm-role-btn.active .pm-role-code {
  background: rgba(255, 255, 255, 0.2);
  color: var(--ui-accent-on);
}
.pm-role-btn.active .pm-role-name {
  color: var(--ui-accent-on);
}
.pm-role-code {
  font-size: 11px;
  font-weight: 700;
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  border-radius: 999px;
  padding: 2px 9px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  min-width: 42px;
  text-align: center;
}
.pm-role-name {
  font-weight: 600;
  color: var(--ui-text);
}
.pm-editor {
  min-width: 0;
}
.pm-group {
  margin-bottom: 26px;
}
.pm-group-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin: 0 0 10px;
}
/* Entity = white card accordion */
.pm-block {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 8px;
  box-shadow: var(--ui-shadow-sm);
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}
.pm-block:hover {
  border-color: var(--ui-border-strong);
}
.pm-entity {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 11px 14px;
  cursor: pointer;
  user-select: none;
  transition: background var(--ui-duration);
}
.pm-entity:hover,
.pm-entity.open {
  background: var(--ui-surface-3);
}
.pm-entity.open {
  border-bottom: 1px solid var(--ui-border);
}
.pm-entity-caret {
  flex: none;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  font-size: 11px;
  line-height: 1;
  transition: transform var(--ui-duration);
}
.pm-entity.open .pm-entity-caret {
  transform: rotate(90deg);
}
.pm-entity-body {
  padding: 8px 10px 10px;
}
.pm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: var(--ui-surface);
  border-radius: var(--ui-radius-sm);
  margin-bottom: 2px;
  font-size: 13.5px;
  transition: background var(--ui-duration);
}
.pm-row:hover {
  background: var(--ui-surface-3);
}
.pm-row.dirty {
  background: var(--ui-warning-soft);
  outline: 1px solid var(--ui-warning);
  outline-offset: -1px;
}
.pm-row-label {
  color: var(--ui-text);
}
.pm-select {
  font-size: 13.5px;
  padding: 5px 10px;
  border: 1px solid var(--ui-border-strong);
  border-radius: 7px;
  background: var(--ui-surface);
  color: var(--ui-text);
  cursor: pointer;
  min-width: 210px;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}
.pm-select:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
  outline: none;
}
.pm-comment {
  font-size: 12.5px;
  color: var(--ui-text-2);
  padding: 8px 0 4px 2px;
  line-height: 1.5;
}
.pm-savebar {
  position: sticky;
  bottom: 12px;
  margin-top: 18px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-left: 4px solid var(--ui-warning);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-lg);
  padding: 12px 16px;
  display: flex;
  gap: 18px;
  align-items: flex-start;
  z-index: 10;
}
.pm-savebar-info {
  flex: 1;
  font-size: 13px;
  color: var(--ui-text);
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
  border: 1px solid var(--ui-border-strong);
  background: var(--ui-surface);
  color: var(--ui-text);
  border-radius: var(--ui-radius-sm);
  padding: 7px 14px;
  cursor: pointer;
  transition: background var(--ui-duration), border-color var(--ui-duration);
}
.pm-btn:hover:not(:disabled) {
  background: var(--ui-surface-3);
}
.pm-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.pm-btn.primary {
  background: var(--ui-accent);
  border-color: var(--ui-accent);
  color: var(--ui-accent-on);
}
.pm-btn.primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
  border-color: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.pm-btn.danger {
  color: var(--ui-danger);
  border-color: color-mix(in srgb, var(--ui-danger) 45%, transparent);
}
.pm-btn.danger:hover:not(:disabled) {
  background: var(--ui-danger-soft);
}
.pm-save-msg {
  font-size: 13px;
  color: var(--ui-success);
  margin: 12px 0;
}
.pm-save-msg.er {
  color: var(--ui-danger);
}
.pm-section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 22px 0 8px;
}
.pm-hint {
  color: var(--ui-text-2);
  font-size: 13px;
  margin: 0 0 10px;
  line-height: 1.5;
}
.pm-roles-editor {
  margin-bottom: 14px;
}
.pm-role-create {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  align-items: flex-end;
}
.pm-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 180px;
}
.pm-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-2);
}
.pm-req {
  color: var(--ui-danger);
  margin-left: 2px;
}
.pm-input.invalid {
  border-color: var(--ui-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-danger) 18%, transparent);
  background: var(--ui-danger-soft);
}
.pm-field-error {
  margin: 0 0 10px;
  color: var(--ui-danger);
  font-size: 12.5px;
  font-weight: 500;
}
.pm-input {
  font-size: 13px;
  padding: 6px 10px;
  border: 1px solid var(--ui-border-strong);
  border-radius: 7px;
  background: var(--ui-surface);
  color: var(--ui-text);
  flex: 1;
  min-width: 180px;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}
.pm-input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
  outline: none;
}
.pm-role-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pm-role-editable {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  transition: border-color var(--ui-duration);
}
.pm-role-editable:hover {
  border-color: var(--ui-border-strong);
}
.pm-role-editable-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.pm-role-editable-desc {
  color: var(--ui-text-2);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-role-editable-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
</style>