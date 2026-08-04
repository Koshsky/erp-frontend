<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'
import {
  barCells,
  boundsCellSpan,
  buildCells,
  cellCount,
  cellSpanToDates,
  clampSpanDates,
  toDate,
  fmtDate,
} from '../calendar'
import { useBarDrag } from '../../../composables/useBarDrag'
import { TooltipCell } from '../../common/TooltipCell'
import type { PlanningMode, PlanningUnit } from '../calendar'

const slots = useSlots()

const props = withDefaults(
  defineProps<{
    anchor: Date | number
    mode: PlanningMode
    unit: PlanningUnit
    startDate: string | Date | number
    endDate: string | Date | number
    /** Границы родителя (процесса/проекта) — ограничивают перетаскивание */
    groupStartDate?: string | Date | number | null
    groupEndDate?: string | Date | number | null
    color?: string
    opacity?: number
    /** Нативный тултип при наведении */
    title?: string
    /** Текст кастомного тултипа (показывается, если не передан слот #tooltip) */
    tooltip?: string
    height?: number
    top?: number
    minWidth?: number
    padding?: string
    shadow?: boolean
    /** Включает перетаскивание и ручки изменения длительности */
    draggable?: boolean
  }>(),
  {
    color: '#34a853',
    opacity: 0.75,
    title: '',
    height: 26,
    top: 5,
    minWidth: 4,
    padding: '0 8px',
    shadow: false,
    draggable: false,
    groupStartDate: null,
    groupEndDate: null,
  },
)

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  /** Дабл клик по бару — открыть редактирование */
  edit: []
}>()

const barEl = ref<HTMLElement | null>(null)

/** Есть ли кастомный тултип: через проп `tooltip` или слот `#tooltip` */
const hasTooltip = computed(() => Boolean(props.tooltip) || Boolean(slots.tooltip))

const cells = computed(() => buildCells(props.anchor, props.mode, props.unit))
const span = computed(() =>
  barCells(props.anchor, props.mode, props.unit, props.startDate, props.endDate),
)
const bounds = computed(() =>
  boundsCellSpan(props.anchor, props.mode, props.unit, props.groupStartDate, props.groupEndDate),
)

/** Бар отсечён слева якорем (исторический старт раньше начала шкалы): левая граница архивная,
 *  её нельзя двигать/перезаписывать — разрешён только ресайз правого края. */
const clippedLeft = computed(
  () =>
    cells.value.length > 0 &&
    toDate(props.startDate).getTime() < cells.value[0].start.getTime(),
)

const barStyle = computed<Record<string, string | number> | null>(() => {
  if (!span.value) return null
  const total = cellCount(props.anchor, props.mode, props.unit)
  return {
    left: (span.value.startCell / total) * 100 + '%',
    width: ((span.value.endCell - span.value.startCell) / total) * 100 + '%',
    background: props.color,
    opacity: props.opacity,
    height: props.height + 'px',
    top: props.top + 'px',
    minWidth: props.minWidth + 'px',
    padding: props.padding,
  }
})

const { isDragging, cursor, previewStyle, startDrag } = useBarDrag({
  cells: () => cells.value,
  getContainer: () => barEl.value?.parentElement ?? null,
  getSpan: () => span.value,
  getBounds: () => bounds.value,
  onCommit: (sp) => {
    if (!cells.value.length) return
    const d = cellSpanToDates(cells.value, sp.startCell, sp.endCell)
    const start_date = clippedLeft.value ? fmtDate(toDate(props.startDate)) : d.start_date
    emit('change', clampSpanDates(start_date, d.end_date, props.groupStartDate, props.groupEndDate))
  },
})

const cursorStyle = computed<Record<string, string>>(() => {
  if (cursor.value) return { cursor: cursor.value }
  if (props.draggable && !clippedLeft.value) return { cursor: 'grab' }
  return { cursor: 'default' }
})

function onBodyPointerDown(e: PointerEvent) {
  if (props.draggable && !clippedLeft.value) startDrag(e, 'move')
}

function onHandlePointerDown(e: PointerEvent, mode: 'resizeStart' | 'resizeEnd') {
  if (props.draggable && (mode !== 'resizeStart' || !clippedLeft.value)) startDrag(e, mode)
}

function onDblClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.gb-handle')) return
  emit('edit')
}

function onContextMenu(e: MouseEvent) {
  emit('contextmenu', { clientX: e.clientX, clientY: e.clientY })
}
</script>

<template>
  <div
    v-if="barStyle"
    ref="barEl"
    class="gantt-bar"
    :class="{ 'gb-draggable': draggable, 'gb-shadow': shadow, 'is-dragging': isDragging }"
    :style="[barStyle, previewStyle, cursorStyle]"
    :title="hasTooltip ? undefined : title"
    @pointerdown="onBodyPointerDown"
    @dblclick="onDblClick"
    @contextmenu.prevent.stop="onContextMenu"
  >
    <TooltipCell v-if="hasTooltip" :text="tooltip ?? ''" :multiline="true">
      <slot />
      <template #popup>
        <slot name="tooltip" />
      </template>
    </TooltipCell>
    <slot v-else />
    <template v-if="draggable">
      <span
        v-if="!clippedLeft"
        class="gb-handle gb-handle-l"
        style="cursor: ew-resize"
        @pointerdown.stop="onHandlePointerDown($event, 'resizeStart')"
      />
      <span
        class="gb-handle gb-handle-r"
        style="cursor: ew-resize"
        @pointerdown.stop="onHandlePointerDown($event, 'resizeEnd')"
      />
    </template>
  </div>
</template>

<style scoped>
.gantt-bar {
  position: absolute;
  border-radius: 5px;
  display: flex;
  align-items: center;
  overflow: hidden;
  box-sizing: border-box;
  transition: opacity 0.15s;
}
.gantt-bar :deep(.tt-trigger) {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  cursor: inherit;
}
.gantt-bar:hover {
  opacity: 0.95 !important;
}
.gb-draggable {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.is-dragging {
  opacity: 0.95 !important;
}
.gb-shadow {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.gb-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 2;
  touch-action: none;
}
.gb-handle-l {
  left: 0;
  border-radius: 5px 0 0 5px;
}
.gb-handle-r {
  right: 0;
  border-radius: 0 5px 5px 0;
}
.gb-handle:hover {
  background: rgba(255, 255, 255, 0.35);
}
</style>

<style>
.gb-tooltip {
  font-size: 12px;
  line-height: 1.45;
}
.gb-tooltip-title {
  font-weight: 700;
  margin-bottom: 2px;
}
.gb-tooltip-row {
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
}
.gb-tooltip-resources {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}
</style>
