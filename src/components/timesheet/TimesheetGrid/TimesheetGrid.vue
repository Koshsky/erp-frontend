<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { fmtDate } from '../../planner/calendar'
import { LABEL_WIDTH } from '../../planner/layout'
import { stateBackground } from '../stateColors'
import TimesheetCell from '../TimesheetCell/TimesheetCell.vue'
import type { ClearPayload, TimesheetGridProps } from './types'

const props = withDefaults(defineProps<TimesheetGridProps>(), {
  error: null,
  busy: false,
})

const emit = defineEmits<{
  assign: [payload: { employeeId: number; stateId: number; startDate: string; endDate: string }]
  clear: [payload: ClearPayload]
  /** Видимый диапазон дат изменился (для дозагрузки окна состояний) */
  range: [payload: { startDate: string; endDate: string }]
}>()

/** Высота строки сотрудника и слоя имён (px): две строки — ФИО + должность */
const ROW_H = 32

/** Активное выделение диапазона (drag) */
const selection = ref<{ employeeId: number; startIdx: number; endIdx: number } | null>(null)

/** Плавающая панель назначения состояния */
const panel = ref<{
  x: number
  y: number
  employeeId: number
  startDate: string
  endDate: string
} | null>(null)

/** Ссылка на панель для измерения её фактического размера */
const panelEl = ref<HTMLElement | null>(null)

/** Отступ панели от краёв окна (px) */
const PANEL_MARGIN = 8

/**
 * Проверяет, помещается ли панель в окно браузера; если нет —
 * сдвигает её так, чтобы она целиком осталась в видимой области.
 */
function clampPanel() {
  const el = panelEl.value
  const p = panel.value
  if (!el || !p) return
  const rect = el.getBoundingClientRect()
  let { x, y } = p
  if (x + rect.width > window.innerWidth - PANEL_MARGIN) {
    x = Math.max(PANEL_MARGIN, window.innerWidth - PANEL_MARGIN - rect.width)
  }
  if (y + rect.height > window.innerHeight - PANEL_MARGIN) {
    y = Math.max(PANEL_MARGIN, window.innerHeight - PANEL_MARGIN - rect.height)
  }
  if (x !== p.x || y !== p.y) panel.value = { ...p, x, y }
}

/** После открытия панели измеряем её и корректируем позицию под размер окна */
watch(panel, (p) => {
  if (p) {
    nextTick(clampPanel)
    window.addEventListener('resize', clampPanel)
  } else {
    window.removeEventListener('resize', clampPanel)
  }
})

function isoFor(i: number): string {
  return fmtDate(props.t.cellStart(i))
}

function isWeekend(i: number): boolean {
  const d = props.t.cellStart(i).getDay()
  return d === 0 || d === 6
}

function employeeName(id: number): string {
  return props.employees.find((e) => e.id === id)?.name ?? `#${id}`
}

function fmtDM(iso?: string): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

function fmtFull(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function isSelected(employeeId: number, idx: number): boolean {
  const s = selection.value
  if (!s || s.employeeId !== employeeId) return false
  const lo = Math.min(s.startIdx, s.endIdx)
  const hi = Math.max(s.startIdx, s.endIdx)
  return idx >= lo && idx <= hi
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || props.busy) return
  const cell = (e.target as HTMLElement).closest<HTMLElement>('.ts-cell')
  if (!cell) return
  const empId = Number(cell.dataset.employeeId)
  const idx = Number(cell.dataset.cellIndex)
  if (empId == null || Number.isNaN(idx)) return
  e.preventDefault()
  selection.value = { employeeId: empId, startIdx: idx, endIdx: idx }
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!selection.value) return
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const cell = el?.closest<HTMLElement>('.ts-cell')
  if (!cell) return
  const empId = Number(cell.dataset.employeeId)
  // Выделение остаётся в строке начального сотрудника
  if (empId !== selection.value.employeeId) return
  const idx = Number(cell.dataset.cellIndex)
  if (!Number.isNaN(idx)) selection.value.endIdx = idx
}

function onPointerUp(e: PointerEvent) {
  const s = selection.value
  selection.value = null
  document.body.style.userSelect = ''
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  if (!s || Number.isNaN(s.endIdx)) return
  const lo = Math.min(s.startIdx, s.endIdx)
  const hi = Math.max(s.startIdx, s.endIdx)
  panel.value = {
    x: Math.min(e.clientX, window.innerWidth - 220),
    y: Math.min(e.clientY, window.innerHeight - 140),
    employeeId: s.employeeId,
    startDate: fmtDate(props.t.cellStart(lo)),
    endDate: fmtDate(props.t.cellEnd(hi)),
  }
  // Сохраняем визуальное выделение, пока панель открыта
  selection.value = { employeeId: s.employeeId, startIdx: lo, endIdx: hi }
}

function onAssign(stateId: number) {
  if (!panel.value) return
  emit('assign', {
    employeeId: panel.value.employeeId,
    stateId,
    startDate: panel.value.startDate,
    endDate: panel.value.endDate,
  })
  closePanel()
}

function onClear() {
  if (!panel.value) return
  emit('clear', {
    employeeId: panel.value.employeeId,
    startDate: panel.value.startDate,
    endDate: panel.value.endDate,
  })
  closePanel()
}

function closePanel() {
  panel.value = null
  selection.value = null
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closePanel()
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('resize', clampPanel)
  document.body.style.userSelect = ''
})

/** Видимый диапазон дат — сигнал для дозагрузки состояний (при прокрутке/зуме) */
watch(
  () => [props.t.windowStart, props.t.viewportCells, props.t.cellPx] as const,
  () => {
    const idx = props.t.visibleIndices
    if (!idx.length) return
    emit('range', {
      startDate: fmtDate(props.t.cellStart(idx[0])),
      endDate: fmtDate(props.t.cellEnd(idx[idx.length - 1])),
    })
  },
  { immediate: true },
)

const labelsH = computed(() => props.employees.length * ROW_H)
</script>

<template>
  <div class="ts" @pointerdown="onPointerDown">
    <!-- Слой имён сотрудников: строки липнут слева, вертикально едут с рядами -->
    <div
      class="ts-labels"
      :style="{ width: LABEL_WIDTH + 'px', marginBottom: '-' + labelsH + 'px' }"
    >
      <div
        v-for="emp in employees"
        :key="'tsl' + emp.id"
        class="ts-label"
        :style="{ height: ROW_H + 'px' }"
        :title="emp.resource_title ? `${emp.name} — ${emp.resource_title}` : emp.name"
      >
        <span class="ts-label-name">{{ emp.name }}</span>
        <span class="ts-label-pos">{{ emp.resource_title }}</span>
      </div>
    </div>

    <!-- Сетка ячеек: ряд на сотрудника, ячейки по видимым дням -->
    <div class="ts-rows">
      <div
        v-for="emp in employees"
        :key="'tsr' + emp.id"
        class="ts-row"
        :style="{ height: ROW_H + 'px' }"
      >
        <div
          v-for="i in t.visibleIndices"
          :key="'tsc' + i"
          class="ts-cell"
          :style="{ left: t.cellLeft(i) + 'px', width: t.cellPx + 'px' }"
          :data-employee-id="emp.id"
          :data-cell-index="i"
        >
          <TimesheetCell
            :state="stateForDay(emp.id ?? 0, isoFor(i)) ?? null"
            :is-weekend="isWeekend(i)"
            :selected="isSelected(emp.id ?? 0, i)"
            :show-text="t.cellPx >= 40"
          />
        </div>
      </div>
    </div>

    <p v-if="error" class="ts-error">{{ error }}</p>

    <!-- Плавающая панель назначения состояния выделенному диапазону -->
    <Teleport to="body">
      <template v-if="panel">
        <div class="ts-overlay" @pointerdown="closePanel" />
        <div class="ts-panel" ref="panelEl" :style="{ left: panel.x + 'px', top: panel.y + 'px' }" role="dialog" :aria-label="'Назначить состояние'">
          <div class="ts-panel-head">
            <span class="ts-panel-title">{{ employeeName(panel.employeeId) }}</span>
            <span class="ts-panel-range" :title="`${fmtFull(panel.startDate)} — ${fmtFull(panel.endDate)}`">{{ fmtDM(panel.startDate) }}–{{ fmtDM(panel.endDate) }}</span>
            <button type="button" class="ts-panel-close" aria-label="Закрыть" @click="closePanel">×</button>
          </div>
          <div class="ts-panel-states">
            <button
              v-for="st in states"
              :key="'ts' + st.id"
              type="button"
              class="ts-state"
              :disabled="busy"
              @click="onAssign(st.id ?? 0)"
            >
              <span
                class="ts-state-swatch"
                :style="{ background: stateBackground(st.code, st.is_available, st.id) }"
              />
              {{ st.name }}
            </button>
          </div>
          <div class="ts-panel-actions">
            <button type="button" class="ts-btn-clear" :disabled="busy" @click="onClear">Сбросить</button>
          </div>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<style scoped>
.ts {
  position: relative;
}
/* Боковая панель имён: липнет слева, поверх контента (ячеек/линий), шапки календаря
   (30) и линии текущей даты (60), но под корнером (90). Ширина колонки 180px, поэтому
   с шапкой не пересекается (у шапки слева — корнер), а линия «сегодня» идёт от x>=180. */
.ts-labels {
  position: sticky;
  left: 0;
  z-index: 80;
  background: #fff;
  box-sizing: border-box;
}
.ts-label {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 0 8px;
  box-sizing: border-box;
  border-bottom: 1px solid #f0f0f0;
  overflow: hidden;
}
.ts-label-name {
  font-weight: 700;
  color: #333;
  font-size: 12px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-label-pos {
  font-size: 11px;
  color: #667;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-rows {
  min-height: 100%;
}
.ts-row {
  position: relative;
  box-sizing: border-box;
  border-bottom: 1px solid #f0f0f0;
}
.ts-cell {
  position: absolute;
  top: 0;
  bottom: 0;
  box-sizing: border-box;
}
.ts-error {
  margin: 10px 0 0;
  font-size: 13px;
  color: #d93025;
}

.ts-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: transparent;
}
.ts-panel {
  position: fixed;
  z-index: 1001;
  width: 200px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border: 1px solid #e0e0e0;
  overflow: hidden;
}
.ts-panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
  font-size: 12px;
}
.ts-panel-title {
  font-weight: 700;
  color: #1a3a6b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-panel-range {
  color: #777;
  flex: 1;
  text-align: right;
}
.ts-panel-close {
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 0 2px;
}
.ts-panel-close:hover {
  color: #333;
}
.ts-panel-states {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.ts-state {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.ts-state:hover:not(:disabled) {
  background: #eef2f8;
}
.ts-state:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ts-state-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}
.ts-panel-actions {
  padding: 0 8px 8px;
}
.ts-btn-clear {
  width: 100%;
  border: 1px solid #e0e0e0;
  background: #fff;
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
  color: #b3261e;
  cursor: pointer;
}
.ts-btn-clear:hover:not(:disabled) {
  background: #fef2f1;
}
.ts-btn-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
