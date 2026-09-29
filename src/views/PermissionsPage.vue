<script setup lang="ts">
/**
 * Access permissions — a preset-centric editor.
 * Presets on the left, capabilities of the selected preset by section on the right.
 * Scopes are rendered in human language in the resource context
 * ("in own processes", "in own projects", "own only", "all").
 * Source of truth — the matrix on the backend (/api/v1/rbac/*); edits are
 * applied immediately (upsert; "no access" = soft delete).
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ConfirmDialog, HintButton } from '../components/common'
import { SCOPE_OPTIONS as SCOPE_CHIPS } from '../components/common/UserPermissionsEditor/labels'
import { canonicalScope, describeScopeExpr, isValidScopeExpr, scopeMoves, toggleScopeMove } from '@/rbacScope'
import { useRbacStore } from '../store'
import { useConfirm } from '../composables/useConfirm'

const rbac = useRbacStore()
const { presets, presetRules, matrix, loading, error, saving } = storeToRefs(rbac)

/** Selected preset (by default — the first one from the catalog, not admin). */
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
  user_admin: 'пользователей',
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
  user_admin: 'Пользователи (администрирование)',
  rbac_config: 'Настройки администрирования',
}

/**
 * Available scopes with human-readable labels in the resource context.
 * The scope set mirrors policies.ScopeApplicable on the backend; the wording
 * itself explains the owner ("in own processes" = process owner, etc.).
 */
const SCOPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  project: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'self', label: 'Только свои' },
    { value: 'all', label: 'Все' },
  ],
  process: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'self', label: 'Только своё' },
    { value: 'up1', label: 'В своих проектах' },
    { value: 'up', label: 'Свои и любые предки' },
    { value: 'sib', label: 'Свои и сиблинги' },
    { value: 'down', label: 'Своё поддерево' },
    { value: 'all', label: 'Все' },
  ],
  task: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'self', label: 'Только своё' },
    { value: 'up1', label: 'В своих процессах' },
    { value: 'up', label: 'Свои и любые предки' },
    { value: 'sib', label: 'Свои и сиблинги' },
    { value: 'down', label: 'Свои подзадачи' },
    { value: 'all', label: 'Все' },
  ],
  milestone: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'up1', label: 'В своих процессах' },
    { value: 'up', label: 'Свои и любые предки' },
    { value: 'all', label: 'Все' },
  ],
  assignment: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'up1', label: 'В своих процессах' },
    { value: 'up', label: 'Свои и любые предки' },
    { value: 'all', label: 'Все' },
  ],
  state: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'all', label: 'Всё' },
  ],
  resource: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'self', label: 'Только свои' },
    { value: 'all', label: 'Все' },
  ],
  worker: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'self', label: 'Только свои (подчинённые)' },
    { value: 'all', label: 'Все' },
  ],
  user_catalog: [
    { value: 'none', label: 'Нет доступа' },
    { value: 'all', label: 'Доступен' },
  ],
  user_admin: [
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
  { key: 'advanced', title: 'Дополнительные ресурсы', resources: ['user_catalog', 'user_admin', 'rbac_config'] },
] as const

const ACTIONS = ['view', 'create', 'update', 'delete'] as const

/** Effective cell scope from the matrix (no rule = "no access"). */
const effective = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const cell of matrix.value) {
    if (!cell.preset || !cell.resource || !cell.action || !cell.scope) continue
    map[cellKey(cell.preset, cell.resource, cell.action)] = cell.scope
  }
  return map
})

/** Rule id for deletion. */
const ruleIdByCell = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  for (const rule of presetRules.value) {
    if (rule.id == null) continue
    map[cellKey(rule.preset ?? '', rule.resource ?? '', rule.action ?? '')] = rule.id
  }
  return map
})

function cellKey(preset: string, resource: string, action: string): string {
  return `${preset}|${resource}|${action}`
}

function cellValue(preset: string, resource: string, action: string): string {
  return staged[cellKey(preset, resource, action)] ?? effective.value[cellKey(preset, resource, action)] ?? 'none'
}

/** Human-readable scope label in the resource context. */
function scopeLabel(resource: string, scope: string): string {
  const opt = SCOPE_OPTIONS[resource]?.find((o) => o.value === scope)
  return opt?.label ?? 'Нет доступа'
}

/** Human-readable names of known presets (the DB catalog keeps descriptions in English). */
const PRESET_TITLES: Record<string, string> = {
  admin: 'Администратор',
  dp: 'Директор проектов',
  rp: 'Руководитель проекта',
  vp: 'Владелец процесса',
  worker: 'Работник',
}

function presetTitle(code: string): string {
  return PRESET_TITLES[code] ?? code
}

/** Preset tabs: the catalog without the admin bypass (admin is a code invariant, not an editable tab). */
const presetList = computed(() => {
  const names: string[] = []
  for (const r of presets.value) {
    if (r.name && r.name !== 'admin' && !names.includes(r.name)) names.push(r.name)
  }
  return names
})

/** Changed cells. */
const staged = reactive<Record<string, string>>({})
const dirtyKeys = computed<string[]>(() =>
  Object.keys(staged).filter((key) => staged[key] !== (effective.value[key] ?? 'none')),
)

/** Canonical form of a scope expression (legacy zones normalize; "all"/"none"
 *  keep their identity — they must never compare equal). */
function canon(scope: string): string {
  return canonicalScope(scope)
}

/** The row zone as an expression ('' — no access). */
function rowText(resource: string, action: string): string {
  const v = cellValue(selected.value, resource, action)
  return v === 'none' ? '' : v
}

/** Спец-чип активен (каноническое сравнение: «⛔ нет доступа» = none). */
function isZoneActive(resource: string, action: string, value: string): boolean {
  return canon(cellValue(selected.value, resource, action)) === canon(value)
}

/** Обычный чип активен, если его ход присутствует в выражении ячейки
 *  (мульти-выбор: активны все отмеченные ходы). */
function isChipOn(resource: string, action: string, value: string): boolean {
  return scopeMoves(cellValue(selected.value, resource, action)).includes(value)
}

/** The row zone contains a move that has no chip (non-standard). */
function isCustomZone(resource: string, action: string): boolean {
  const v = rowText(resource, action)
  if (!v) return false
  const chips = (SCOPE_CHIPS[resource] ?? []).map((o) => o.value)
  return scopeMoves(v).some((m) => !chips.includes(m))
}

/** Chip click toggles a move in the expression (multi-select; all/none are
 *  exclusive). Removing the last move or reaching the effective value —
 *  remove the staged edit. */
function onChipClick(resource: string, action: string, value: string) {
  const key = cellKey(selected.value, resource, action)
  const next = toggleScopeMove(cellValue(selected.value, resource, action), value)
  if (next === '') { delete staged[key]; return }
  const eff = effective.value[key] ?? 'none'
  if (canon(next) === canon(eff)) { delete staged[key]; return }
  staged[key] = next
}

/** «⛔ запрет» toggle: stage none; clicking again removes the staged edit. */
function onRevokeClick(resource: string, action: string) {
  const key = cellKey(selected.value, resource, action)
  if (isZoneActive(resource, action, 'none')) {
    if (staged[key] !== undefined) delete staged[key]
    return
  }
  const eff = effective.value[key] ?? 'none'
  if (canon('none') === canon(eff)) { delete staged[key]; return }
  staged[key] = 'none'
}

/** Free-expression input: valid — stage; empty — revert to effective;
 *  invalid — leave untouched (the field shows the error state). */
function onExprChange(e: Event, resource: string, action: string) {
  const v = (e.target as HTMLInputElement).value.trim()
  const key = cellKey(selected.value, resource, action)
  if (v === '') { delete staged[key]; return }
  if (!isValidScopeExpr(v)) return
  const eff = effective.value[key] ?? 'none'
  if (canon(v) === canon(eff)) { delete staged[key]; return }
  staged[key] = v
}

/** Rows with the free-expression input open. */
const exprOpen = reactive(new Set<string>())
function toggleExpr(key: string) {
  if (exprOpen.has(key)) exprOpen.delete(key)
  else exprOpen.add(key)
}

/** A cell holds a REAL change: its staged value differs from the effective
 *  one (an entry equal to the effective value is not a change). */
function isDirtyCell(preset: string, resource: string, action: string): boolean {
  const key = cellKey(preset, resource, action)
  return staged[key] !== undefined && staged[key] !== (effective.value[key] ?? 'none')
}

/** Card-header summary: grants + staged edits of the resource. */
function cardSummary(resource: string): string {
  const granted = ACTIONS.filter((a) => cellValue(selected.value, resource, a) !== 'none').length
  const edited = ACTIONS.filter((a) => isDirtyCell(selected.value, resource, a)).length
  const base = granted ? `${granted} из ${ACTIONS.length} — с доступом` : 'без доступа'
  return edited ? `${base} · ${edited} изм.` : base
}

/** Change descriptions for the save bar. */
const dirtyChanges = computed(() =>
  dirtyKeys.value.map((key) => {
    const [, resource, action] = key.split('|')
    const from = effective.value[key] ?? 'none'
    const to = staged[key]
    return `${ACTION_LABELS[action] ?? action} ${RESOURCE_LABELS[resource] ?? resource}: ${scopeLabel(resource, to)}${from !== 'none' ? ` (было: ${scopeLabel(resource, from)})` : ''}`
  }),
)

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
    const [preset, resource, action] = key.split('|')
    const scope = staged[key]
    let ok: boolean
    if (scope === 'none') {
      const id = ruleIdByCell.value[key]
      ok = id != null ? await rbac.deleteRule(id) : true
    } else {
      ok = await rbac.upsertRule({ preset, resource, action, scope })
    }
    if (!ok) {
      failures.push(`${preset} · ${ACTION_LABELS[action] ?? action} ${RESOURCE_LABELS[resource] ?? resource}`)
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

/** Preset name pattern: latin letters, digits, «-», «_» (mirrors the backend codec). */
const PRESET_NAME_RE = /^[a-zA-Z0-9_-]+$/
const newPresetName = ref('')
const newPresetDesc = ref('')
const presetMsg = ref<{ ok: boolean; text: string } | null>(null)
/** Client-side validation error of the required preset-name field (null = valid). */
const newPresetNameError = ref<string | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)

function failPresetName(message: string) {
  newPresetNameError.value = message
  nameInput.value?.focus()
}

/** Drop the highlight as soon as the user starts typing. */
watch(newPresetName, () => {
  newPresetNameError.value = null
})

async function onCreatePreset() {
  const name = newPresetName.value.trim()
  if (!name) {
    failPresetName('Укажите имя пресета (латиница, цифры, «-», «_»), описание можно не заполнять')
    return
  }
  if (!PRESET_NAME_RE.test(name)) {
    failPresetName('Имя пресета: только латиница, цифры, «-», «_»')
    return
  }
  newPresetNameError.value = null
  const ok = await rbac.createPreset({ name, description: newPresetDesc.value.trim() })
  presetMsg.value = ok ? { ok: true, text: 'Пресет создан' } : { ok: false, text: error.value ?? 'Не удалось создать пресет' }
  if (ok) {
    newPresetName.value = ''
    newPresetDesc.value = ''
  }
}

async function onUpdatePresetDesc(presetName: string) {
  const desc = window.prompt('Новое описание пресета', rbac.presets.find((r) => r.name === presetName)?.description ?? '')
  if (desc == null) return
  const ok = await rbac.updatePreset(presetName, desc.trim())
  presetMsg.value = ok ? { ok: true, text: 'Описание обновлено' } : { ok: false, text: 'Не удалось обновить описание' }
}

function onDeletePreset(presetName: string) {
  if (presetName === 'admin') return
  ask(
    'Удалить пресет «' + presetName + '»? Назначенные пользователи сохранятся, но потеряют базовые права этого пресета; правила пресета будут удалены.',
    () => {
      void (async () => {
        const ok = await rbac.deletePreset(presetName)
        presetMsg.value = ok ? null : { ok: false, text: 'Не удалось удалить пресет' }
      })()
    },
    'Удалить пресет',
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

/** Select the default preset after the catalog is loaded. */
watch(presetList, (list) => {
  if ((!selected.value || !list.includes(selected.value)) && list.length) {
    selected.value = list[0]
  }
})

onMounted(() => {
  if (!presetRules.value.length && !loading.value) {
    void rbac.loadRbac()
  }
})
</script>

<template>
  <section class="pm">
    <div class="pm-head">
      <h2 class="pm-title">Пресеты прав</h2>
      <HintButton hint="presets-editor" />
    </div>

    <p v-if="loading && !presetRules.length" class="pm-load">Загрузка...</p>
    <p v-if="error && !presetRules.length" class="pm-load er">{{ error }}</p>

    <div v-if="presetRules.length && presetList.length" class="pm-layout">
      <!-- Roles -->
      <nav class="pm-presets">
        <button
          v-for="preset in presetList"
          :key="preset"
          type="button"
          class="pm-preset-btn"
          :class="{ active: preset === selected }"
          @click="selected = preset"
        >
          <span class="pm-preset-code">{{ preset }}</span>
          <span class="pm-preset-name">
            {{ presetTitle(preset) }}
          </span>
        </button>
      </nav>

      <!-- Editor of the selected preset -->
      <div class="pm-editor">
        <div v-for="group in GROUPS" :key="group.key" class="pm-group">
          <h3 class="pm-group-title">{{ group.title }}</h3>
          <div v-for="resource in group.resources" :key="resource" class="pm-block">
            <div class="pm-block-head">
              <span class="pm-block-title">{{ ENTITY_NAMES[resource] ?? resource }}</span>
              <span class="pm-block-summary">{{ cardSummary(resource) }}</span>
            </div>
            <div
              v-for="action in ACTIONS"
              :key="action"
              class="pm-row"
              :class="{ dirty: isDirtyCell(selected, resource, action) }"
            >
              <span class="pm-row-label">{{ ACTION_LABELS[action] }}</span>
              <div class="pm-chips">
                <button
                  v-for="opt in SCOPE_CHIPS[resource] ?? []"
                  :key="opt.value"
                  type="button"
                  class="pm-chip"
                  :class="{ on: isChipOn(resource, action, opt.value) }"
                  @click="onChipClick(resource, action, opt.value)"
                >
                  {{ opt.label }}
                </button>
                <button
                  type="button"
                  class="pm-chip rev"
                  :class="{ on: isZoneActive(resource, action, 'none') }"
                  :title="isZoneActive(resource, action, 'none') ? 'Вернуть' : 'Нет доступа'"
                  @click="onRevokeClick(resource, action)"
                >⛔ нет доступа</button>
                <button
                  v-if="!exprOpen.has(cellKey(selected, resource, action))"
                  type="button"
                  class="pm-expr-toggle"
                  title="Свободное выражение области"
                  @click="toggleExpr(cellKey(selected, resource, action))"
                >✎</button>
                <!-- Собранное выражение при множественном выборе -->
                <span v-if="scopeMoves(rowText(resource, action)).length > 1" class="pm-zone-mini">
                  {{ rowText(resource, action) }}
                </span>
              </div>
              <div
                v-if="exprOpen.has(cellKey(selected, resource, action)) || isCustomZone(resource, action)"
                class="pm-expr-block"
              >
                <input
                  class="pm-expr"
                  :class="{ bad: !isValidScopeExpr(rowText(resource, action)) }"
                  :value="rowText(resource, action)"
                  placeholder="выражение: self sib, up1, down…"
                  spellcheck="false"
                  @change="onExprChange($event, resource, action)"
                />
                <span class="pm-expr-desc" :class="{ bad: !isValidScopeExpr(rowText(resource, action)) }">
                  {{ rowText(resource, action) === '' ? '—' : describeScopeExpr(rowText(resource, action)) }}
                </span>
                <button
                  type="button"
                  class="pm-expr-close"
                  title="Скрыть"
                  @click="toggleExpr(cellKey(selected, resource, action))"
                >✕</button>
              </div>
            </div>
          </div>
        </div>

        <h3 class="pm-section-title">Пресеты</h3>
        <div class="pm-presets-editor">
          <div class="pm-preset-create">
            <label class="pm-field">
              <span class="pm-field-label">Имя пресета<span class="pm-req" title="обязательное поле">*</span></span>
              <input
                ref="nameInput"
                v-model="newPresetName"
                class="pm-input"
                :class="{ invalid: !!newPresetNameError }"
                :aria-invalid="!!newPresetNameError"
                maxlength="32"
                placeholder="имя пресета, напр. auditor"
              />
            </label>
            <label class="pm-field">
              <span class="pm-field-label">Описание</span>
              <input v-model="newPresetDesc" class="pm-input" maxlength="80" placeholder="описание" />
            </label>
            <button type="button" class="pm-btn primary" @click="onCreatePreset">Создать пресет</button>
          </div>
          <p v-if="newPresetNameError" class="pm-field-error" role="alert">{{ newPresetNameError }}</p>
          <p v-if="presetMsg" class="pm-save-msg" :class="{ er: !presetMsg.ok }">{{ presetMsg.text }}</p>
          <div class="pm-preset-list">
            <div v-for="r in presets" :key="r.name" class="pm-preset-editable">
              <div class="pm-preset-editable-main">
                <span class="pm-preset-code">{{ r.name }}</span>
                <span class="pm-preset-editable-desc">{{ r.description || '—' }}</span>
              </div>
              <div class="pm-preset-editable-actions">
                <button type="button" class="pm-btn" @click="onUpdatePresetDesc(r.name ?? '')">Описание</button>
                <button type="button" class="pm-btn danger" :disabled="r.name === 'admin'" @click="onDeletePreset(r.name ?? '')" title="админ — инвариант в коде">Удалить</button>
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
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.pm-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
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
.pm-presets {
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: sticky;
  top: 16px;
}
.pm-preset-btn {
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
.pm-preset-btn:hover {
  border-color: var(--ui-border-strong);
  background: var(--ui-surface-3);
}
.pm-preset-btn.active {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
  color: var(--ui-accent-on);
}
.pm-preset-btn.active .pm-preset-code {
  background: rgba(255, 255, 255, 0.2);
  color: var(--ui-accent-on);
}
.pm-preset-btn.active .pm-preset-name {
  color: var(--ui-accent-on);
}
.pm-preset-code {
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
.pm-preset-name {
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
/* Resource card (Variant A design — same as the user-rights editor) */
.pm-block {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.pm-block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--ui-border);
}
.pm-block-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text);
}
.pm-block-summary {
  font-size: 11px;
  color: var(--ui-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Action row: label + zone chips + «no access» + expression */
.pm-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  flex-wrap: wrap;
  font-size: 13px;
  transition: background var(--ui-duration);
}
.pm-row + .pm-row { border-top: 1px solid var(--ui-border); }
.pm-row:hover { background: var(--ui-surface-3); }
.pm-row.dirty { background: var(--ui-warning-soft); }
.pm-row-label {
  width: 84px;
  flex-shrink: 0;
  color: var(--ui-text);
}
.pm-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.pm-chip {
  border: 1px solid var(--ui-border-strong);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-family: inherit;
  color: var(--ui-text-2);
  background: var(--ui-surface);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  white-space: nowrap;
}
.pm-chip:hover { border-color: var(--ui-accent); }
.pm-chip.on {
  background: var(--ui-accent);
  border-color: var(--ui-accent);
  color: var(--ui-accent-on);
  font-weight: 600;
}
.pm-chip.rev {
  color: var(--ui-danger);
  border-color: light-dark(rgba(185, 28, 28, 0.45), rgba(248, 113, 113, 0.55));
  background: transparent;
}
.pm-chip.rev.on {
  background: var(--ui-danger);
  border-color: var(--ui-danger);
  color: #fff;
}
.pm-expr-toggle {
  border: 1px solid var(--ui-border-strong);
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11px;
  color: var(--ui-text-muted);
  background: var(--ui-surface);
  cursor: pointer;
}
.pm-expr-toggle:hover { border-color: var(--ui-accent); color: var(--ui-accent); }
/* Собранное выражение множественного выбора — компактная подпись */
.pm-zone-mini {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10px;
  color: var(--ui-text-muted);
  background: var(--ui-surface-2);
  border-radius: 5px;
  padding: 2px 7px;
}

/* Free-expression row under the chips */
.pm-expr-block {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 2px 0 2px 94px;
  flex-wrap: wrap;
}
.pm-expr {
  flex: 0 1 240px;
  min-width: 160px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px;
  border: 1px solid var(--ui-border-strong);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--ui-text);
  background: var(--ui-surface);
}
.pm-expr.bad { border-color: var(--ui-danger); outline: 1px solid var(--ui-danger); }
.pm-expr-desc { font-size: 11px; color: var(--ui-text-2); }
.pm-expr-desc.bad { color: var(--ui-danger); }
.pm-expr-close {
  border: none;
  background: transparent;
  font-size: 11px;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 5px;
}
.pm-expr-close:hover { background: var(--ui-surface-2); color: var(--ui-text); }

@media (max-width: 640px) {
  .pm-row-label { width: 100%; }
  .pm-expr-block { padding-left: 0; }
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
.pm-presets-editor {
  margin-bottom: 14px;
}
.pm-preset-create {
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
.pm-preset-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pm-preset-editable {
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
.pm-preset-editable:hover {
  border-color: var(--ui-border-strong);
}
.pm-preset-editable-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.pm-preset-editable-desc {
  color: var(--ui-text-2);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-preset-editable-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
</style>