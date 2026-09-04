<script setup lang="ts">
/**
 * UserPermissionsEditor — права доступа пользователя.
 *
 * Компактный список способностей в мягких карточках ресурсов:
 * каждая строка «действие + ресурс» содержит фиксированный по ширине
 * кастомный dropdown (всегда виден → нет сдвигов layout). Выбор зоны /
 * запрета / возврата к пресету через выпадающее меню. Статус строки
 * подсвечен цветом источника (пресет/индивидуально/запрет).
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRbacStore } from '../../../store'
import type { PermissionCell, PermissionOverride, UserPermissionsModel } from './types'
import { GROUPS, ACTIONS, RESOURCE_LABELS, ACTION_LABELS, SCOPE_OPTIONS, scopeLabel, DEFAULT_GRANT_ZONE } from './labels'

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
  if (id <= 0 || rbac.userPermissions) return
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

function statusText(r: string, a: string): string {
  const z = effectiveZone(r, a); const s = rowSource(r, a)
  if (s === 'revoked') return 'Запретить'
  if (!z) return 'Нет доступа'
  if (s === 'override') return `Индивидуально: ${scopeLabel(r, z)}`
  return `По пресету: ${scopeLabel(r, z)}`
}
function statusClass(r: string, a: string): string {
  switch (rowSource(r, a)) { case 'override': return 'ov'; case 'revoked': return 'rev'; default: return '' }
}
function ddValue(r: string, a: string): string {
  // Value shown in dropdown button text
  const z = effectiveZone(r, a); const s = rowSource(r, a)
  if (s === 'revoked') return 'revoke'
  if (!z) return 'none'
  if (s === 'override') return `ov:${z}`
  return `pr:${z}`
}
function defaultZone(r: string) { return DEFAULT_GRANT_ZONE[r] ?? 'all' }

/* ── действия ──────────────────────────────────────────── */
function pick(r: string, a: string, val: string) {
  if (val === 'revert') { delete staged[key(r, a)]; return }
  if (val === 'revoke') { staged[key(r, a)] = { resource: r, action: a, scope: '', granted: false }; return }
  staged[key(r, a)] = { resource: r, action: a, scope: val, granted: true }
}
function resetAll() { for (const k of Object.keys(staged)) delete staged[k] }

/* ── управление открытым dropdown (только один открыт) ─── */
const openDD = ref<string | null>(null)   // key(resource/action) или null
function toggleDD(k: string) { openDD.value = openDD.value === k ? null : k }
document.addEventListener('click', (e: Event) => {
  const t = e.target as HTMLElement
  if (!t.closest('.dd-wrap')) openDD.value = null
})
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
      </div>
    </div>

    <p v-if="loading" class="uped-st">Загрузка прав…</p>
    <p v-else-if="loadError" class="uped-st er" role="alert">{{ loadError }}</p>

    <div v-else-if="model?.admin" class="uped-admin" role="note">
      Администратор — полный доступ (обход в коде); индивидуальные права не применимы.
    </div>

    <!-- Список карточек ресурсов -->
    <div v-else-if="model" class="uped-list">
      <div v-for="group in GROUPS" :key="group.key" class="uped-group">
        <h4 class="uped-group-title">{{ group.title }}</h4>
        <div v-for="res in group.resources" :key="res" class="uped-res-card">
          <div class="uped-res-title">{{ RESOURCE_LABELS[res] ?? res }}</div>
          <div v-for="act in ACTIONS" :key="act" class="uped-row">
            <span class="uped-cap">{{ ACTION_LABELS[act] }}</span>
            <span class="uped-status" :class="statusClass(res, act)">{{ statusText(res, act) }}</span>

            <!-- Кастомный dropdown — всегда занимает место, нет сдвигов -->
            <div class="dd-wrap">
              <button class="dd-btn" :class="{ open: openDD === key(res, act) }"
                      @click.stop="toggleDD(key(res, act))">
                <span>{{ ddValue(res, act) === 'revoke' ? 'Запретить'
                     : ddValue(res, act) === 'none' ? 'Нет доступа'
                     : ddValue(res, act).startsWith('ov:') ? 'Индивидуально: ' + scopeLabel(res, ddValue(res, act).slice(3))
                     : 'По пресету: ' + scopeLabel(res, ddValue(res, act).slice(3)) }}</span>
                <span class="dd-chevron">▾</span>
              </button>
              <div class="dd-menu" :class="{ show: openDD === key(res, act) }">
                <!-- Возврат к пресету (только если есть override) -->
                <div v-if="overrideOf(res, act)" class="dd-opt revert"
                     @click.stop="pick(res, act, 'revert'); toggleDD(key(res, act))">
                  ↩ Вернуть к пресету
                </div>
                <!-- Зоны (resource-aware labels: e.g. process parent = «В своих проектах») -->
                <div v-for="opt in SCOPE_OPTIONS[res] ?? []" :key="opt.value"
                     class="dd-opt" :class="{ active: ddValue(res, act) === `ov:${opt.value}` || ddValue(res, act) === `pr:${opt.value}` }"
                     @click.stop="pick(res, act, opt.value); toggleDD(key(res, act))">
                  {{ opt.label }}
                </div>
                <!-- Запрет -->
                <div class="dd-opt" :class="{ active: ddValue(res, act) === 'revoke' }"
                     @click.stop="pick(res, act, 'revoke'); toggleDD(key(res, act))">
                  Запретить
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="uped-note">
      Dropdown всегда виден → переключение состояния не сдвигает элементы.
      Сохраняется кнопкой «Сохранить».
    </p>
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
.uped-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--ui-text); }
.uped-preset-select {
  font-family: inherit; font-size: 12px; color: var(--ui-text);
  background: var(--ui-surface); border: 1px solid var(--ui-border-strong);
  border-radius: 8px; padding: 4px 10px; cursor: pointer;
  transition: border-color 0.15s ease-out;
}
.uped-preset-select:hover { border-color: var(--ui-accent); }
.uped-preset-select:focus {
  outline: none; border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 18%, transparent);
}
.uped-dirty { font-size: 12px; font-weight: 600; color: var(--ui-accent); }
.uped-reset {
  margin-left: auto; font-size: 12px; color: var(--ui-text-muted);
  background: var(--ui-surface); border: 1px solid var(--ui-border-strong);
  border-radius: 999px; padding: 4px 12px; cursor: pointer;
}
.uped-reset:hover { color: var(--ui-text); border-color: var(--ui-accent); }
.uped-st { color: var(--ui-text-2); font-size: 14px; padding: 20px; text-align: center; }
.er { color: var(--ui-danger); }
.uped-admin {
  padding: 16px; border: 1px dashed var(--ui-border-strong);
  border-radius: var(--ui-radius-sm); color: var(--ui-text-2); font-size: 13px;
}
.uped-list { display: flex; flex-direction: column; gap: 2px; }
.uped-group { margin-bottom: 8px; }
.uped-group-title {
  margin: 10px 0 6px; font-size: 11px; font-weight: 700;
  letter-spacing: 0.05em; text-transform: uppercase; color: var(--ui-text-muted);
}

/* Карточка ресурса — мягкая тень, скругление. No overflow clipping: the
   absolutely-positioned dropdown must overlay the following cards. */
.uped-res-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  margin-bottom: 6px;
}
.uped-res-title {
  font-size: 13px; font-weight: 700; color: var(--ui-text);
  padding: 10px 14px 6px; border-bottom: 1px solid var(--ui-border);
}

/* Строка способности — фиксированная высота, три колонки */
.uped-row {
  display: grid;
  grid-template-columns: minmax(90px, 130px) minmax(110px, 1fr) 220px;
  align-items: center;
  gap: 12px;
  padding: 7px 14px;
  min-height: 42px;
}
.uped-row + .uped-row { border-top: 1px solid var(--ui-border); }

.uped-cap {
  font-size: 13px; color: var(--ui-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.uped-status {
  font-size: 11px; color: var(--ui-text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.uped-status.ov { color: var(--ui-accent); font-weight: 600; }
.uped-status.rev { color: var(--ui-danger); font-weight: 600; }

/* ── Кастомный dropdown ─────────────────────────────── */
.dd-wrap { position: relative; width: 100%; }
.dd-btn {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px; border: 1px solid var(--ui-border-strong);
  border-radius: 8px; background: var(--ui-surface); color: var(--ui-text);
  font-family: inherit; font-size: 12px; cursor: pointer;
  transition: border-color 0.15s ease-out;
  text-align: left;
}
.dd-btn:hover { border-color: var(--ui-accent); }
.dd-btn.open {
  border-color: var(--ui-accent);
  border-bottom-left-radius: 0; border-bottom-right-radius: 0;
}
.dd-chevron { color: var(--ui-text-muted); font-size: 10px; flex: none; margin-left: 6px; }

.dd-menu {
  position: absolute; top: 100%; left: 0; right: 0;
  background: var(--ui-surface); border: 1px solid var(--ui-accent);
  border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;
  z-index: 20; display: none; flex-direction: column;
  max-height: 220px; overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.dd-menu.show { display: flex; }

.dd-opt {
  padding: 8px 12px; font-size: 12px; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  transition: background 0.1s;
  color: var(--ui-text);
}
.dd-opt:hover { background: var(--ui-surface-2); }
.dd-opt.active::before { content: '✓'; color: var(--ui-ok, var(--ui-accent)); font-weight: 700; }
.dd-opt.revert { color: var(--ui-accent); font-style: italic; }

.uped-note { margin: 2px 0 0; font-size: 11px; color: var(--ui-text-muted); }

@media (max-width: 640px) {
  .uped-row {
    grid-template-columns: 1fr;
    gap: 4px; padding: 8px 12px;
  }
}
</style>
