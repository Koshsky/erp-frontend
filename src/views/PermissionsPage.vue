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
import { ConfirmDialog, ContextMenu, HintButton, InfoTooltip, ModalForm, TooltipCell } from '../components/common'
import { GROUPS, ACTIONS, SCOPE_OPTIONS as SCOPE_CHIPS, resourceLabel, resourceTitle, actionTitle, scopeLabel } from '../components/common/UserPermissionsEditor/labels'
import { canonicalScope, scopeMoves, toggleScopeMove } from '@/rbacScope'
import { useRbacStore } from '../store'
import { useConfirm } from '../composables/useConfirm'
import { notifyError, notifySuccess } from '../notify/state'
import { presetDisplayName } from '../utils/presets'
import { t } from '@/i18n'

const rbac = useRbacStore()
const { presets, presetRules, matrix, loading, error, saving } = storeToRefs(rbac)

/** Selected preset (by default — the first one from the catalog, not admin). */
const selected = ref('')

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

/** Human-readable name of a preset catalog entry: the stored name, else a
 *  fallback for a built-in tag, else the tag itself. */
function presetName(tag: string): string {
  return presetDisplayName(presetEntry(tag) ?? { tag })
}

/** Catalog entry of the selected tag (name/description) or undefined. */
function presetEntry(tag: string) {
  return presets.value.find((p) => p.tag === tag)
}

/** Tooltip lines of a preset: its description, else the tag itself. */
function presetTooltipLines(tag: string): string[] {
  const description = presetEntry(tag)?.description?.trim()
  return description ? [description] : [tag]
}

/** Preset tabs: the catalog without the admin bypass (admin is a code invariant, not an editable tab). */
const presetList = computed(() => {
  const tags: string[] = []
  for (const p of presets.value) {
    if (p.tag && p.tag !== 'admin' && !tags.includes(p.tag)) tags.push(p.tag)
  }
  return tags
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
  const base = granted
    ? t('adminConfig.presets.cardSummaryGranted', { granted, total: ACTIONS.length })
    : t('adminConfig.presets.cardSummaryDenied')
  return edited ? base + t('adminConfig.presets.cardSummaryEdited', { count: edited }) : base
}

/** Change descriptions for the save bar. */
const dirtyChanges = computed(() =>
  dirtyKeys.value.map((key) => {
    const [, resource, action] = key.split('|')
    const from = effective.value[key] ?? 'none'
    const to = staged[key]
    const label = `${actionTitle(action) || action} ${resourceLabel(resource) || resource}`
    return from !== 'none'
      ? `${label}: ${t('adminConfig.presets.changeLineFrom', { to: scopeLabel(resource, to), from: scopeLabel(resource, from) })}`
      : `${label}: ${scopeLabel(resource, to)}`
  }),
)

async function save() {
  const keys = dirtyKeys.value
  if (!keys.length || saving.value) return
  saving.value = true
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
      failures.push(`${preset} · ${actionTitle(action) || action} ${resourceLabel(resource) || resource}`)
    }
  }
  await rbac.reloadRules()
  saving.value = false
  if (failures.length) {
    notifyError(t('adminConfig.presets.saveFailed', { list: failures.join('; ') }))
    return
  }
  for (const key of keys) delete staged[key]
  notifySuccess(t('adminConfig.presets.changesSaved'))
}

function cancelDirty() {
  for (const key of dirtyKeys.value) delete staged[key]
}

// Reset to defaults.
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

// === Preset management (left panel) ===

/** Only the admin preset is immutable (a code invariant on the backend);
 *  every other preset — including the seeded dp/rp/vp/worker — can be
 *  deleted or renamed by an administrator. */
const BUILTIN_PRESETS = new Set(['admin'])

/** Preset name pattern: letters of any script (latin/cyrillic), digits, «-», «_»
 *  (mirrors the backend codec). */
const PRESET_TAG_RE = /^[\p{L}\p{N}_-]+$/u

/** Validates the create/rename form: tag (code) + display name. excludeTag —
 *  the rename target's own tag (collision with itself is allowed). */
function validatePresetForm(tag: string, name: string, excludeTag?: string): string | null {
  const trimmed = tag.trim()
  if (!trimmed) return t('adminConfig.presets.validationTagRequired')
  if (!PRESET_TAG_RE.test(trimmed)) return t('adminConfig.presets.validationTagFormat')
  if (excludeTag !== trimmed && rbac.presets.some((r) => r.tag === trimmed)) {
    return t('adminConfig.presets.validationTagDuplicate')
  }
  if (!name.trim()) return t('adminConfig.presets.validationNameRequired')
  return null
}

/* — create modal — */
const createOpen = ref(false)
const createForm = reactive({ tag: '', name: '', description: '' })
/** Local validation message (empty/invalid/duplicate tag, empty name);
 *  mutation errors are surfaced by the global toast (http.ts) instead. */
const createError = ref<string | null>(null)
const createBusy = ref(false)

async function onCreatePreset() {
  const tag = createForm.tag.trim()
  const name = createForm.name.trim()
  const localError = validatePresetForm(tag, name)
  if (localError) {
    createError.value = localError
    return
  }
  createBusy.value = true
  const ok = await rbac.createPreset({ tag, name, description: createForm.description.trim() })
  createBusy.value = false
  if (!ok) return
  notifySuccess(t('adminConfig.presets.created', { name }))
  createOpen.value = false
  selected.value = tag
  void rbac.loadRbac()
}

/* — rename modal (tag + name + description) — */
const renameOpen = ref(false)
const renameTarget = ref<string>('')
const renameForm = reactive({ tag: '', name: '', description: '' })
/** Local validation message; mutation errors — to the toast. */
const renameError = ref<string | null>(null)
const renameBusy = ref(false)

function openRename(presetTag: string) {
  if (BUILTIN_PRESETS.has(presetTag)) return
  const entry = presetEntry(presetTag)
  renameTarget.value = presetTag
  renameForm.tag = presetTag
  renameForm.name = entry?.name ?? ''
  renameForm.description = entry?.description ?? ''
  renameError.value = null
  renameOpen.value = true
}

async function onRenamePreset() {
  const tag = renameForm.tag.trim()
  const name = renameForm.name.trim()
  const localError = validatePresetForm(tag, name, renameTarget.value)
  if (localError) {
    renameError.value = localError
    return
  }
  renameBusy.value = true
  const ok = await rbac.updatePreset(renameTarget.value, {
    tag,
    name,
    description: renameForm.description.trim(),
  })
  renameBusy.value = false
  if (!ok) return
  notifySuccess(t('adminConfig.presets.renamed', { name }))
  renameOpen.value = false
  if (selected.value === renameTarget.value) selected.value = tag
  void rbac.loadRbac()
}

/* — delete modal (confirmation by typing the preset tag) — */
const deleteOpen = ref(false)
const deleteTarget = ref<string>('')
const deleteConfirm = ref('')
const deleteBusy = ref(false)

function openDelete(presetTag: string) {
  if (BUILTIN_PRESETS.has(presetTag)) return
  deleteTarget.value = presetTag
  deleteConfirm.value = ''
  deleteOpen.value = true
}

async function onDeletePreset() {
  if (deleteConfirm.value !== deleteTarget.value) return
  deleteBusy.value = true
  const ok = await rbac.deletePreset(deleteTarget.value)
  deleteBusy.value = false
  if (!ok) return
  notifySuccess(t('adminConfig.presets.deleted', { name: presetName(deleteTarget.value) }))
  deleteOpen.value = false
  if (selected.value === deleteTarget.value) {
    const rest = presetList.value.filter((p) => p !== deleteTarget.value)
    selected.value = rest[0] ?? ''
  }
  void rbac.loadRbac()
}

/* — context menu (ПКМ) — */
const ctxMenu = reactive({ open: false, x: 0, y: 0, preset: '' })

function onPresetContextMenu(e: MouseEvent, presetTag: string) {
  if (BUILTIN_PRESETS.has(presetTag)) return
  ctxMenu.open = true
  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY
  ctxMenu.preset = presetTag
}

function onCtxSelect(id: string) {
  const target = ctxMenu.preset
  ctxMenu.open = false
  if (id === 'rename') openRename(target)
  if (id === 'delete') openDelete(target)
}

function onReset() {
  ask(t('adminConfig.presets.resetConfirm'), () => {
    void (async () => {
      const ok = await rbac.resetRbac()
      if (ok) notifySuccess(t('adminConfig.presets.resetDone'))
      else notifyError(error.value ?? t('adminConfig.presets.resetFailed'))
    })()
  }, t('adminConfig.presets.resetButton'))
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
      <h2 class="pm-title">{{ t('adminConfig.presets.title') }}</h2>
      <HintButton hint="presets-editor" />
    </div>

    <p v-if="loading && !presetRules.length" class="pm-load">{{ t('adminConfig.presets.loading') }}</p>
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
          @contextmenu.prevent="onPresetContextMenu($event, preset)"
        >
          <TooltipCell :multiline="true">
            <span class="pm-preset-code">{{ preset }}</span>
            <span class="pm-preset-name">
              {{ presetName(preset) }}
            </span>
            <template #popup>
              <InfoTooltip :title="presetName(preset)" :lines="presetTooltipLines(preset)" />
            </template>
          </TooltipCell>
          <span
            v-if="!BUILTIN_PRESETS.has(preset)"
            class="pm-preset-remove"
            role="button"
            tabindex="0"
            :title="t('adminConfig.presets.removeTitle', { name: presetName(preset) })"
            @click.stop="openDelete(preset)"
            @keydown.enter.stop.prevent="openDelete(preset)"
          >✕</span>
        </button>
        <button type="button" class="pm-preset-add" @click="createError = null; createOpen = true">
          {{ t('adminConfig.presets.add') }}
        </button>
        <ContextMenu
          :open="ctxMenu.open"
          :x="ctxMenu.x"
          :y="ctxMenu.y"
          :items="[
            { id: 'rename', label: t('adminConfig.presets.ctxRename') },
            { id: 'delete', label: t('adminConfig.presets.ctxDelete') },
          ]"
          @select="onCtxSelect"
          @close="ctxMenu.open = false"
        />
      </nav>

      <!-- Editor of the selected preset -->
      <div class="pm-editor">
        <div v-for="group in GROUPS" :key="group.key" class="pm-group">
          <h3 class="pm-group-title">{{ t(`adminConfig.perm.group.${group.key}`) }}</h3>
          <div v-for="resource in group.resources" :key="resource" class="pm-block">
            <div class="pm-block-head">
              <span class="pm-block-title">{{ resourceTitle(resource) }}</span>
              <span class="pm-block-summary">{{ cardSummary(resource) }}</span>
            </div>
            <div
              v-for="action in ACTIONS"
              :key="action"
              class="pm-row"
              :class="{ dirty: isDirtyCell(selected, resource, action) }"
            >
              <span class="pm-row-label">{{ actionTitle(action) }}</span>
              <div class="pm-chips">
                <button
                  v-for="opt in SCOPE_CHIPS[resource] ?? []"
                  :key="opt.value"
                  type="button"
                  class="pm-chip"
                  :class="{ on: isChipOn(resource, action, opt.value) }"
                  @click="onChipClick(resource, action, opt.value)"
                >
                  {{ scopeLabel(resource, opt.value) }}
                </button>
                <button
                  type="button"
                  class="pm-chip rev"
                  :class="{ on: isZoneActive(resource, action, 'none') }"
                  :title="isZoneActive(resource, action, 'none') ? t('adminConfig.presets.revertTitle') : t('adminConfig.presets.revokeTitle')"
                  @click="onRevokeClick(resource, action)"
                >{{ t('adminConfig.presets.revokeChip') }}</button>
                <!-- Собранное выражение при множественном выборе -->
                <span v-if="scopeMoves(rowText(resource, action)).length > 1" class="pm-zone-mini">
                  {{ rowText(resource, action) }}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Preset management modals: create / rename / delete (type the tag).
         Mutation failures are surfaced by the global toast (http.ts); the
         modal error line shows LOCAL validation only (empty/invalid/duplicate
         tag, empty name) — e.g. a cyrillic preset tag is valid and must be sent. -->
    <ModalForm
      :open="createOpen"
      :title="t('adminConfig.presets.createTitle')"
      :submit-label="t('adminConfig.presets.createSubmit')"
      :busy="createBusy"
      :error="createError"
      :fields="[
        { key: 'name', label: t('adminConfig.presets.fieldName'), type: 'text', required: true, placeholder: t('adminConfig.presets.fieldNamePlaceholder') },
        { key: 'tag', label: t('adminConfig.presets.fieldTag'), type: 'text', required: true, placeholder: t('adminConfig.presets.fieldTagPlaceholder') },
        { key: 'description', label: t('adminConfig.presets.fieldDescription'), type: 'textarea', placeholder: t('adminConfig.presets.fieldDescriptionPlaceholder') },
      ]"
      @save="(v: Record<string, string | number>) => { createForm.name = String(v.name ?? ''); createForm.tag = String(v.tag ?? ''); createForm.description = String(v.description ?? ''); void onCreatePreset() }"
      @close="createOpen = false"
    />

    <ModalForm
      :open="renameOpen"
      :title="t('adminConfig.presets.renameTitle')"
      :submit-label="t('adminConfig.presets.renameSubmit')"
      :busy="renameBusy"
      :error="renameError"
      :fields="[
        { key: 'name', label: t('adminConfig.presets.fieldName'), type: 'text', required: true, value: renameForm.name, placeholder: t('adminConfig.presets.renameNamePlaceholder') },
        { key: 'tag', label: t('adminConfig.presets.fieldTag'), type: 'text', required: true, value: renameForm.tag, placeholder: t('adminConfig.presets.renameTagPlaceholder') },
        { key: 'description', label: t('adminConfig.presets.fieldDescription'), type: 'textarea', value: renameForm.description, placeholder: t('adminConfig.presets.fieldDescriptionPlaceholder') },
      ]"
      @save="(v: Record<string, string | number>) => { renameForm.name = String(v.name ?? ''); renameForm.tag = String(v.tag ?? ''); renameForm.description = String(v.description ?? ''); void onRenamePreset() }"
      @close="renameOpen = false"
    />

    <!-- Удаление с подтверждением: нужно ввести тэг пресета -->
    <div v-if="deleteOpen" class="pm-del-overlay" @mousedown.self="deleteOpen = false">
      <div class="pm-del" role="dialog" aria-modal="true" :aria-label="t('adminConfig.presets.deleteAria')">
        <h3 class="pm-del-title">{{ t('adminConfig.presets.deleteTitle', { tag: deleteTarget }) }}</h3>
        <p class="pm-del-text">
          {{ t('adminConfig.presets.deleteText') }}
        </p>
        <input
          v-model="deleteConfirm"
          class="pm-del-input"
          :class="{ invalid: deleteConfirm !== '' && deleteConfirm !== deleteTarget }"
          :aria-invalid="deleteConfirm !== '' && deleteConfirm !== deleteTarget"
          :placeholder="deleteTarget"
        />
        <div class="pm-del-actions">
          <button type="button" class="pm-btn" @click="deleteOpen = false">{{ t('common.cancel') }}</button>
          <button
            type="button"
            class="pm-btn danger"
            :disabled="deleteConfirm !== deleteTarget || deleteBusy"
            @click="onDeletePreset"
          >
            {{ deleteBusy ? t('adminConfig.presets.deleting') : t('common.delete') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Save bar -->
    <div v-if="dirtyKeys.length" class="pm-savebar">
      <div class="pm-savebar-info">
        <strong>{{ t('adminConfig.presets.changes', { count: dirtyKeys.length }) }}</strong>
        <ul>
          <li v-for="c in dirtyChanges" :key="c">{{ c }}</li>
        </ul>
      </div>
      <div class="pm-savebar-actions">
        <button type="button" class="pm-btn primary" :disabled="saving" @click="save">{{ saving ? t('adminConfig.presets.saving') : t('adminConfig.presets.save') }}</button>
        <button type="button" class="pm-btn" :disabled="saving" @click="cancelDirty">{{ t('adminConfig.presets.cancel') }}</button>
        <button type="button" class="pm-btn danger" :disabled="saving" @click="onReset">{{ t('adminConfig.presets.resetAll') }}</button>
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
@import '../styles/tokens.css';

.pm-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.pm-title {
  font-size: calc(var(--ui-font-scale, 1) * 24px);
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
}
.pm-load {
  color: var(--ui-text-faint);
  font-size: calc(var(--ui-font-scale, 1) * 13px);
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
  padding: 11px 10px 11px 14px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface);
  cursor: pointer;
  font-size: calc(var(--ui-font-scale, 1) * 14px);
  color: var(--ui-text);
  transition: border-color var(--ui-duration), background var(--ui-duration);
}
.pm-preset-btn .pm-preset-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Аккуратный крестик удаления на кнопке пресета */
.pm-preset-remove {
  margin-left: auto;
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--ui-font-scale, 1) * 12px);
  line-height: 1;
  color: var(--ui-text-muted);
  opacity: 0.65;
  transition: background var(--ui-duration), color var(--ui-duration), opacity var(--ui-duration);
}
.pm-preset-remove:hover {
  background: var(--ui-danger);
  color: #fff;
  opacity: 1;
}
.pm-preset-btn.active .pm-preset-remove {
  color: var(--ui-accent-on);
}
.pm-preset-btn.active .pm-preset-remove:hover {
  background: var(--ui-danger);
}
/* Добавить пресет */
.pm-preset-add {
  display: block;
  width: 100%;
  padding: 9px 14px;
  border: 1px dashed var(--ui-border-strong);
  border-radius: 10px;
  background: transparent;
  color: var(--ui-accent);
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--ui-duration), border-color var(--ui-duration);
}
.pm-preset-add:hover {
  background: var(--ui-accent-soft);
  border-color: var(--ui-accent);
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
  font-size: calc(var(--ui-font-scale, 1) * 11px);
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
  font-size: calc(var(--ui-font-scale, 1) * 12px);
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
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 700;
  color: var(--ui-text);
}
.pm-block-summary {
  font-size: calc(var(--ui-font-scale, 1) * 11px);
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
  font-size: calc(var(--ui-font-scale, 1) * 13px);
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
  font-size: calc(var(--ui-font-scale, 1) * 11px);
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
  font-size: calc(var(--ui-font-scale, 1) * 11px);
  color: var(--ui-text-muted);
  background: var(--ui-surface);
  cursor: pointer;
}
.pm-expr-toggle:hover { border-color: var(--ui-accent); color: var(--ui-accent); }
/* Собранное выражение множественного выбора — компактная подпись */
.pm-zone-mini {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: calc(var(--ui-font-scale, 1) * 10px);
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
  font-size: calc(var(--ui-font-scale, 1) * 11px);
  border: 1px solid var(--ui-border-strong);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--ui-text);
  background: var(--ui-surface);
}
.pm-expr.bad { border-color: var(--ui-danger); outline: 1px solid var(--ui-danger); }
.pm-expr-desc { font-size: calc(var(--ui-font-scale, 1) * 11px); color: var(--ui-text-2); }
.pm-expr-desc.bad { color: var(--ui-danger); }
.pm-expr-close {
  border: none;
  background: transparent;
  font-size: calc(var(--ui-font-scale, 1) * 11px);
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 5px;
}
.pm-expr-close:hover { background: var(--ui-surface-2); color: var(--ui-text); }

@media (max-width: 640px) {
  .pm-row-label { width: 100%; }
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
  font-size: calc(var(--ui-font-scale, 1) * 13px);
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
  font-size: calc(var(--ui-font-scale, 1) * 13px);
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
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  color: var(--ui-success);
  margin: 12px 0;
}
.pm-save-msg.er {
  color: var(--ui-danger);
}

/* Удаление пресета — модалка с подтверждением (ввод имени) */
.pm-del-overlay {
  position: fixed;
  inset: 0;
  z-index: 40001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
}
.pm-del {
  width: 100%;
  max-width: 420px;
  background: var(--ui-surface);
  border-radius: 10px;
  box-shadow: var(--ui-shadow-md);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pm-del-title {
  margin: 0;
  font-size: calc(var(--ui-font-scale, 1) * 16px);
  font-weight: 700;
  color: var(--ui-text);
}
.pm-del-text {
  margin: 0;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  line-height: 1.5;
  color: var(--ui-text-2);
}
.pm-del-input {
  font-family: inherit;
  font-size: calc(var(--ui-font-scale, 1) * 14px);
  padding: 8px 10px;
  border: 1px solid var(--ui-border-strong);
  border-radius: 7px;
  background: var(--ui-surface);
  color: var(--ui-text);
}
.pm-del-input.invalid {
  border-color: var(--ui-danger);
  outline: 1px solid var(--ui-danger);
}
.pm-del-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

</style>