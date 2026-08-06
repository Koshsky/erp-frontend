<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { cellRangeForSpan, clampSpanDates, spanToDates, formatDateRange } from '../calendar'
import { useTimelineItem } from '../../../composables/useTimelineItem'
import { TooltipCell, GanttTooltip } from '../../common'
import type { BarProps } from './types'

const slots = useSlots()

const props = withDefaults(defineProps<BarProps>(), {
  title: '',
  projectCode: '',
  color: '#34a853',
  opacity: 0.75,
  tooltip: '',
  height: 24,
  top: 1,
  minWidth: 4,
  padding: '0 8px',
  shadow: false,
  draggable: true,
  groupStartDate: null,
  groupEndDate: null,
})

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  /** Дабл клик по бару — открыть редактирование */
  edit: []
}>()

/** Есть ли кастомный тултип: через проп `tooltip` или слот `#tooltip` */
const hasTooltip = computed(() => Boolean(props.tooltip) || Boolean(slots.tooltip))

const span = computed(() =>
  cellRangeForSpan(props.timeline.origin, props.timeline.unit, props.startDate, props.endDate),
)

const { bounds, visible, isDragging, cursor, previewStyle, startDrag } = useTimelineItem({
  timeline: () => props.timeline,
  groupStartDate: props.groupStartDate,
  groupEndDate: props.groupEndDate,
  getSpan: () => span.value,
  onCommit: (sp) => {
    const d = spanToDates(props.timeline.origin, props.timeline.unit, sp.startCell, sp.endCell)
    emit('change', clampSpanDates(d.start_date, d.end_date, props.groupStartDate, props.groupEndDate))
  },
})

const barStyle = computed<Record<string, string | number> | null>(() => {
  if (!span.value || !visible.value) return null
  const t = props.timeline
  const s = span.value
  return {
    left: t.cellLeft(s.startCell) + 'px',
    width: (s.endCell - s.startCell) * t.cellPx + 'px',
    background: props.color,
    opacity: props.opacity,
    height: props.height + 'px',
    top: props.top + 'px',
    minWidth: props.minWidth + 'px',
    padding: props.padding,
  }
})

const cursorStyle = computed<Record<string, string>>(() => {
  if (cursor.value) return { cursor: cursor.value }
  if (props.draggable) return { cursor: 'grab' }
  return { cursor: 'default' }
})

/** Диапазон дат бара «дд.мм.гггг — дд.мм.гггг» (для тултипа и слотов) */
const dateRange = computed(() => formatDateRange(props.startDate, props.endDate))

function onBodyPointerDown(e: PointerEvent) {
  if (props.draggable) startDrag(e, 'move')
}

function onHandlePointerDown(e: PointerEvent, mode: 'resizeStart' | 'resizeEnd') {
  if (props.draggable) startDrag(e, mode)
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
    class="gantt-bar"
    :class="{ 'gb-draggable': draggable, 'gb-shadow': shadow, 'is-dragging': isDragging }"
    :style="[barStyle, previewStyle, cursorStyle]"
    :title="hasTooltip ? undefined : title"
    @pointerdown="onBodyPointerDown"
    @dblclick="onDblClick"
    @contextmenu.prevent.stop="onContextMenu"
  >
    <TooltipCell v-if="hasTooltip" :text="tooltip ?? ''" :multiline="true">
      <slot>
        <span class="lb-title">{{ title }}</span>
        <span v-if="projectCode" class="lb-code">{{ projectCode }}</span>
      </slot>
      <template #popup>
        <slot name="tooltip" :dateRange="dateRange">
          <GanttTooltip :title="title" :rows="[dateRange]" />
        </slot>
      </template>
    </TooltipCell>
    <slot v-else>
      <span class="lb-title">{{ title }}</span>
      <span v-if="projectCode" class="lb-code">{{ projectCode }}</span>
    </slot>
    <template v-if="draggable">
      <span
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
.lb-title {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  pointer-events: none;
}
.lb-code {
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
  padding: 0 5px;
  margin-left: 6px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
