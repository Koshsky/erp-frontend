<script setup lang="ts">
/**
 * UserPermissionsEditor — права доступа пользователя.
 *
 * Карточки по ресурсам (вариант A): у каждого ресурса — карточка с шапкой
 * (название + сводка) и строками действий; в строке видны сразу все чипы
 * зон (self/up1/up/sib/down/all) + «⛔ запрет»; сочетания собираются
 * отметкой нескольких чипов. Подсказка — одна кнопка «?» в шапке блока
 * (центральная панель).
 *
 * В шапке блока — переключатель пресета (вместо текста «от пресета …»).
 * Выбранный пресет сразу перестраивает базис правил ниже: в режиме draft —
 * черновик из матрицы пресета, в режиме user — пересчёт эффективного базиса
 * по матрице выбранного пресета поверх серверных переопределений.
 *
 * Режимы: user (загрузка из стора) | draft (базис из матрицы пресета).
 * Админ-пресет — read-only заглушка.
 * Эмиты: update:overrides (полный набор переопределений), update:dirty,
 * update:preset (смена пресета).
 */
import { computed, onMounted, reactive, watch } from 'vue'
import { useRbacStore } from '../../../store'
import type { PermissionCell, PermissionOverride, UserPermissionsModel } from './types'
import { GROUPS, ACTIONS, RESOURCE_LABELS, ACTION_LABELS, SCOPE_OPTIONS } from './labels'
import { canonicalScope, scopeMoves, toggleScopeMove } from '@/rbacScope'
import HintButton from '../HintButton/HintButton.vue'

const props = defineProps<{
  userId: number
  mode?: 'draft' | 'user'
  preset?: string
  presetOptions?: Array<{ value: string; label: string }>
  preview?: UserPermissionsModel | null
}>()

const emit = defineEmits<{
  (e: 'update:overrides', overrides: PermissionOverride[]): void
  (e: 'update:dirty', dirty: boolean): void
  (e: 'update:preset', preset: string): void
}>()

const rbac = useRbacStore()
const isDraft = computed(() => props.mode === 'draft')

/* ── модель данных ─────────────────────────────────────── */
/** Baseline cells of a preset from the effective matrix (like the page backend view). */
function cellsOf(preset: string): PermissionCell[] {
  return rbac.matrix
    .filter((c) => c.preset === preset && c.resource && c.action && c.scope)
    .map((c) => ({ resource: c.resource ?? '', action: c.action ?? '', scope: c.scope ?? '' }))
}

/** Final cells: the preset baseline merged with the per-user overrides. */
function effectiveOf(presetScope: PermissionCell[], overrides: PermissionOverride[]): PermissionCell[] {
  const byKey = new Map(presetScope.map((p) => [key(p.resource, p.action), p]))
  for (const o of overrides) {
    const k = key(o.resource, o.action)
    if (o.granted) byKey.set(k, { resource: o.resource, action: o.action, scope: o.scope ?? '' })
    else byKey.delete(k)
  }
  return [...byKey.values()]
}

const model = computed<UserPermissionsModel | null>(() => {
  if (props.preview) return props.preview
  if (isDraft.value) {
    const preset = props.preset ?? ''
    const cells = cellsOf(preset)
    return { preset, admin: preset === 'admin', overrides: [], presetScope: cells, effective: cells }
  }
  const v = rbac.userPermissions
  if (!v) return null
  const preset = props.preset || v.preset || null
  const overrides = (v.overrides ?? []).map((o) => ({ resource: o.resource, action: o.action, scope: o.scope ?? '', granted: o.granted ?? false }))
  const fromServer = (v.preset_scope ?? []).map((p) => ({ resource: p.resource ?? '', action: p.action ?? '', scope: p.scope ?? '' }))
  // The selected preset drives the visible baseline: switching it in the header
  // immediately rebuilds the rows below. Falls back to the server snapshot
  // while the matrix is not loaded yet.
  const presetScope = rbac.matrix.length ? cellsOf(preset ?? '') : fromServer
  return { preset, admin: v.admin ?? false, overrides, presetScope, effective: effectiveOf(presetScope, overrides) }
})

const loading = computed(() => (isDraft.value ? false : rbac.userPermissionsLoading))
const loadError = computed(() => (isDraft.value ? null : rbac.userPermissionsError))

function key(resource: string, action: string) { return `${resource}/${action}` }

const presetMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  for (const p of model.value?.presetScope ?? []) m[key(p.resource, p.action)] = p.scope
  return m
})

const staged = reactive<Record<string, PermissionOverride>>({})

function fromView(): Record<string, PermissionOverride> {
  const out: Record<string, PermissionOverride> = {}
  for (const o of model.value?.overrides ?? []) out[key(o.resource, o.action)] = o
  return out
}

// Объявлены ДО watch(model) — иначе TDZ при immediate в draft-режиме.
const overridesList = computed<PermissionOverride[]>(() =>
  Object.values(staged).map((o) => ({ resource: o.resource, action: o.action, scope: o.scope ?? '', granted: o.granted })),
)
const dirty = computed<boolean>(() => JSON.stringify(overridesList.value) !== lastSaved)
let lastSaved = '000'

watch(model, (m) => {
  if (!m || !Array.isArray(m.overrides)) return
  // Seed `staged` from the server overrides only when the override set itself
  // changed (initial load / reload). In draft mode every model change re-seeds —
  // switching the preset resets the draft overrides to the new baseline. In user
  // mode a preset switch keeps the unsaved per-capability edits (only the
  // baseline below changes).
  const sig = JSON.stringify(m.overrides)
  if (!isDraft.value && sig === lastSaved) return
  lastSaved = sig
  for (const k of Object.keys(staged)) delete staged[k]
  Object.assign(staged, fromView())
  emit('update:overrides', overridesList.value)
  emit('update:dirty', false)
}, { immediate: true })

watch(overridesList, () => {
  emit('update:overrides', overridesList.value)
  emit('update:dirty', dirty.value)
}, { deep: true })

function ensureLoaded(id: number) {
  if (props.preview) return
  // The live baseline (both modes) is built from the effective matrix.
  if (!rbac.matrix.length && !rbac.loading) void rbac.loadRbac()
  if (isDraft.value) return
  if (id <= 0) return
  // Load per user: the store keeps the snapshot of the LAST opened user; a
  // non-null snapshot of another user must not block this one (otherwise the
  // editor shows the previous user's permissions — e.g. the admin stub for a
  // non-admin).
  if (rbac.userPermissions?.user_id === id) return
  void rbac.loadUserPermissions(id)
}
onMounted(() => ensureLoaded(props.userId))
watch(() => props.userId, (id) => ensureLoaded(id))

/* ── состояние способности ─────────────────────────────── */
function overrideOf(r: string, a: string) { return staged[key(r, a)] }
function effectiveZone(r: string, a: string): string {
  const ov = overrideOf(r, a)
  if (ov) return ov.granted ? ov.scope ?? '' : ''
  return presetMap.value[key(r, a)] ?? ''
}
type Src = 'preset' | 'override' | 'revoked' | 'none'
function rowSource(r: string, a: string): Src {
  const ov = overrideOf(r, a)
  if (ov) { if (!ov.granted) return 'revoked'; return ov.scope ? 'override' : 'none' }
  return presetMap.value[key(r, a)] ? 'preset' : 'none'
}
function hasAccess(r: string, a: string) { return effectiveZone(r, a) !== '' }

/* ── действия ──────────────────────────────────────────── */
function pick(r: string, a: string, val: string) {
  if (val === 'revert') { delete staged[key(r, a)]; return }
  if (val === 'revoke') { staged[key(r, a)] = { resource: r, action: a, scope: '', granted: false }; return }
  staged[key(r, a)] = { resource: r, action: a, scope: val, granted: true }
}
function resetAll() { for (const k of Object.keys(staged)) delete staged[k] }

/* ── выражения области (дерево владения) ───────────────── */
/** Текущая зона строки как выражение ('' — нет доступа/запрет); показывается
 *  компактной подписью при нескольких выбранных ходах. */
function exprText(r: string, a: string): string {
  const z = effectiveZone(r, a)
  if (!z || !hasAccess(r, a)) return ''
  return z
}

/** Чип активен, если его ход присутствует в текущем выражении зоны
 *  (мульти-выбор: активны все отмеченные ходы). */
function isChipOn(r: string, a: string, value: string): boolean {
  const z = effectiveZone(r, a)
  if (!z) return false
  return scopeMoves(z).includes(value)
}

/** Клик по чипу переключает ход в выражении (мульти-выбор); all/none
 *  эксклюзивны. Снятие всех ходов или результат, равный пресету, —
 *  возврат к пресету. */
function onChipClick(r: string, a: string, value: string) {
  const next = toggleScopeMove(effectiveZone(r, a), value)
  if (next === '') { pick(r, a, 'revert'); return }
  const preset = presetMap.value[key(r, a)] ?? ''
  if (preset && canonicalScope(next) === canonicalScope(preset)) { pick(r, a, 'revert'); return }
  pick(r, a, next)
}

/** Переключатель «запрет»: повторный клик возвращает к пресету. */
function onRevokeClick(r: string, a: string) {
  if (rowSource(r, a) === 'revoked') pick(r, a, 'revert')
  else pick(r, a, 'revoke')
}

/** Пресе-ход строки (стиль «по пресету»). */
function isPresetZone(r: string, a: string, value: string): boolean {
  return rowSource(r, a) === 'preset' && isChipOn(r, a, value)
}

/**
 * Server snapshot of the user's effective permissions — what the BACKEND holds
 * right now: the loaded rbac.userPermissions preset rules (preset_scope) merged
 * with the saved overrides, using the same effectiveOf logic as the model but
 * built ONLY from the server snapshot (never from the live matrix). It drives
 * the "changed" rows in user mode: a row must be highlighted only while the
 * frontend staged value differs from this snapshot, not from the preset
 * baseline — so after a successful save (and a reload of the snapshot) the
 * highlight clears.
 */
const serverSnapshot = computed<Record<string, string>>(() => {
  const v = rbac.userPermissions
  if (!v) return {}
  const presetScope = (v.preset_scope ?? []).map((p) => ({
    resource: p.resource ?? '',
    action: p.action ?? '',
    scope: p.scope ?? '',
  }))
  const overrides = (v.overrides ?? []).map((o) => ({
    resource: o.resource,
    action: o.action,
    scope: o.scope ?? '',
    granted: o.granted ?? false,
  }))
  const m: Record<string, string> = {}
  for (const c of effectiveOf(presetScope, overrides)) m[key(c.resource, c.action)] = c.scope
  return m
})

/** Реальное изменение строки относительно базиса: запрет — всегда; override
 *  — только если его зона канонически отличается от зоны пресета (override,
 *  совпадающий с пресетом, изменением не является). */
function isChangedCell(r: string, a: string): boolean {
  if (isDraft.value) {
    // Draft mode (create): no server exists — compare against the preset baseline.
    const s = rowSource(r, a)
    if (s === 'revoked') return true
    if (s !== 'override') return false
    return canonicalScope(effectiveZone(r, a)) !== canonicalScope(presetMap.value[key(r, a)] ?? '')
  }
  // User mode: yellow only when the staged row differs from what the backend
  // holds (the server snapshot); a saved row matches the snapshot → not yellow.
  const ov = overrideOf(r, a)
  let stagedScope: string
  if (ov) stagedScope = ov.granted ? ov.scope ?? '' : ''
  else stagedScope = presetMap.value[key(r, a)] ?? ''
  return canonicalScope(stagedScope) !== canonicalScope(serverSnapshot.value[key(r, a)] ?? '')
}

/* ── сводка карточки ресурса ───────────────────────────── */
function cardSummary(res: string): string {
  const ind = ACTIONS.filter((a) => rowSource(res, a) === 'override' && isChangedCell(res, a)).length
  const rev = ACTIONS.filter((a) => rowSource(res, a) === 'revoked').length
  if (ind === 0 && rev === 0) return 'по пресету'
  const parts: string[] = []
  if (ind) parts.push(`${ind} из ${ACTIONS.length} — индивидуально`)
  if (rev) parts.push(`${rev} запрет${rev > 1 ? 'а' : ''}`)
  return parts.join(' · ')
}
</script>

<template>
  <section class="uped">
    <!-- Шапка: строка 1 — заголовок, строка 2 — переключатель пресета и действия.
         Смена пресета сразу перестраивает базис правил ниже (edit) / черновик (create). -->
    <div class="uped-head">
      <h3 class="uped-title">Права доступа</h3>
      <div class="uped-tools">
        <select
          v-if="presetOptions && presetOptions.length"
          class="uped-preset-select"
          :value="preset ?? model?.preset ?? ''"
          aria-label="Пресет прав"
          @change="$emit('update:preset', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in presetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <span v-if="dirty" class="uped-dirty">есть изменения</span>
        <button v-if="dirty" type="button" class="uped-reset" @click="resetAll">Сбросить индивидуальные</button>
        <!-- Единственная подсказка блока — в шапке (центральная панель) -->
        <HintButton hint="permissions-editor" />
      </div>
    </div>

    <p v-if="loading" class="uped-st">Загрузка прав…</p>
    <p v-else-if="loadError" class="uped-st er" role="alert">{{ loadError }}</p>

    <div v-else-if="model?.admin" class="uped-admin" role="note">
      Администратор — полный доступ (обход в коде); индивидуальные права не применимы.
    </div>

    <!-- Список карточек ресурсов (вариант A: шапка-сводка + строки действий с чипами) -->
    <div v-else-if="model" class="uped-list">
      <div v-for="group in GROUPS" :key="group.key" class="uped-group">
        <h4 class="uped-group-title">{{ group.title }}</h4>
        <div v-for="res in group.resources" :key="res" class="uped-res-card">
          <div class="uped-res-head">
            <span class="uped-res-title">{{ RESOURCE_LABELS[res] ?? res }}</span>
            <span class="uped-res-summary">{{ cardSummary(res) }}</span>
          </div>

          <div v-for="act in ACTIONS" :key="act" class="ur-row" :class="{ changed: isChangedCell(res, act) }">
            <span class="ur-cap">{{ ACTION_LABELS[act] }}</span>

            <div class="ur-chips">
              <button
                v-for="opt in SCOPE_OPTIONS[res] ?? []"
                :key="opt.value"
                type="button"
                class="ur-chip"
                :class="{
                  on: isChipOn(res, act, opt.value),
                  preset: isPresetZone(res, act, opt.value),
                }"
                :title="opt.label"
                @click="onChipClick(res, act, opt.value)"
              >
                {{ opt.label }}
              </button>
              <button
                type="button"
                class="ur-chip rev"
                :class="{ on: rowSource(res, act) === 'revoked' }"
                :title="rowSource(res, act) === 'revoked' ? 'Вернуть к пресету' : 'Запретить'"
                @click="onRevokeClick(res, act)"
              >⛔ запрет</button>
              <!-- Собранное выражение при множественном выборе -->
              <span v-if="scopeMoves(exprText(res, act)).length > 1" class="ur-zone-mini">
                {{ exprText(res, act) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@import '../../../styles/tokens.css';

.uped {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.uped-head {
  display: flex; flex-direction: column; gap: 8px;
}
.uped-tools {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.uped-title { margin: 0; font-size: calc(var(--ui-font-scale, 1) * 16px); font-weight: 700; color: var(--ui-text); }
.uped-preset-select {
  font-family: inherit; font-size: calc(var(--ui-font-scale, 1) * 12px); color: var(--ui-text);
  background: var(--ui-surface); border: 1px solid var(--ui-border-strong);
  border-radius: 8px; padding: 4px 10px; cursor: pointer;
  transition: border-color 0.15s ease-out;
}
.uped-preset-select:hover { border-color: var(--ui-accent); }
.uped-preset-select:focus {
  outline: none; border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 18%, transparent);
}
.uped-dirty { font-size: calc(var(--ui-font-scale, 1) * 12px); font-weight: 600; color: var(--ui-accent); }
.uped-reset {
  margin-left: auto; font-size: calc(var(--ui-font-scale, 1) * 12px); color: var(--ui-text-muted);
  background: var(--ui-surface); border: 1px solid var(--ui-border-strong);
  border-radius: 999px; padding: 4px 12px; cursor: pointer;
}
.uped-reset:hover { color: var(--ui-text); border-color: var(--ui-accent); }
.uped-st { color: var(--ui-text-2); font-size: calc(var(--ui-font-scale, 1) * 14px); padding: 20px; text-align: center; }
.er { color: var(--ui-danger); }
.uped-admin {
  padding: 16px; border: 1px dashed var(--ui-border-strong);
  border-radius: var(--ui-radius-sm); color: var(--ui-text-2); font-size: calc(var(--ui-font-scale, 1) * 13px);
}
.uped-list { display: flex; flex-direction: column; gap: 2px; }
.uped-group { margin-bottom: 8px; }
.uped-group-title {
  margin: 10px 0 6px; font-size: calc(var(--ui-font-scale, 1) * 11px); font-weight: 700;
  letter-spacing: 0.05em; text-transform: uppercase; color: var(--ui-text-muted);
}

/* Карточка ресурса — мягкая тень, скругление */
.uped-res-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  margin-bottom: 8px;
}
.uped-res-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--ui-border);
}
.uped-res-title {
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 700;
  color: var(--ui-text);
}
.uped-res-summary {
  font-size: calc(var(--ui-font-scale, 1) * 11px);
  color: var(--ui-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Строка действия: подпись + чипы зон + запрет/выражение */
.ur-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  flex-wrap: wrap;
  transition: background 0.12s;
}
.ur-row + .ur-row { border-top: 1px solid var(--ui-border); }
.ur-row:hover { background: var(--ui-surface-3); }
/* Реальное изменение (override ≠ пресет или запрет) — подсветка;
   без изменения строка сохраняет исходный цвет. */
.ur-row.changed { background: var(--ui-warning-soft); }

.ur-cap {
  width: 84px;
  flex-shrink: 0;
  font-size: calc(var(--ui-font-scale, 1) * 12px);
  color: var(--ui-text);
}
.ur-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.ur-chip {
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
.ur-chip:hover { border-color: var(--ui-accent); }
.ur-chip.on {
  background: var(--ui-accent);
  border-color: var(--ui-accent);
  color: var(--ui-accent-on);
  font-weight: 600;
}
/* Активная зона, унаследованная от пресета — полупрозрачная подсветка */
.ur-chip.on.preset {
  background: color-mix(in srgb, var(--ui-accent) 16%, transparent);
  border-color: var(--ui-accent);
  color: var(--ui-accent);
  font-weight: 600;
}
.ur-chip.rev {
  color: var(--ui-danger);
  border-color: light-dark(rgba(185, 28, 28, 0.45), rgba(248, 113, 113, 0.55));
  background: transparent;
}
.ur-chip.rev.on {
  background: var(--ui-danger);
  border-color: var(--ui-danger);
  color: #fff;
}

/* Собранное выражение множественного выбора — компактная подпись */
.ur-zone-mini {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: calc(var(--ui-font-scale, 1) * 10px);
  color: var(--ui-text-muted);
  background: var(--ui-surface-2);
  border-radius: 5px;
  padding: 2px 7px;
}

@media (max-width: 640px) {
  .ur-cap { width: 100%; }
}
</style>
