<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  cellIndexForDate,
  cellStartDate,
  clampDateToBounds,
  fmtDate,
} from '../calendar'
import { useTimelineItem } from '../../../composables/useTimelineItem'
import { TooltipCell } from '../../common/TooltipCell'
import { BarTooltip } from '../../common/Tooltips'
import type { MilestoneMarkerProps } from './types'

const props = withDefaults(defineProps<MilestoneMarkerProps>(), {
  color: '#fbbc04',
  draggable: true,
  stripHeight: 20,
  groupStartDate: null,
  groupEndDate: null,
})

const emit = defineEmits<{
  change: [payload: { date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  /** Double click on the milestone — open editing */
  edit: []
}>()

const rootEl = ref<HTMLElement | null>(null)

/** Milestone date formatted for the tooltip (localized) */
const formattedDate = computed(() => {
  const d = props.timeline.cellStart(cellIndexForDate(props.timeline.origin, props.timeline.unit, props.date))
  return d.toLocaleDateString('ru')
})

/** Milestone cell index */
const idx = computed(() =>
  cellIndexForDate(props.timeline.origin, props.timeline.unit, props.date),
)

const { visible, isDragging, cursor, previewStyle, startDrag } = useTimelineItem({
  timeline: () => props.timeline,
  groupStartDate: props.groupStartDate,
  groupEndDate: props.groupEndDate,
  getSpan: () => ({ startCell: idx.value, endCell: idx.value + 1 }),
  onCommit: (sp) => {
    const date = clampDateToBounds(
      fmtDate(cellStartDate(props.timeline.origin, props.timeline.unit, sp.startCell)),
      props.groupStartDate,
      props.groupEndDate,
    )
    emit('change', { date })
  },
})

/** Position and ray flag */
const pos = computed(() => {
  if (!visible.value) return null
  return {
    left: props.timeline.cellLeft(idx.value) + 'px',
    width: props.timeline.cellPx + 'px',
  }
})

const markerStyle = computed<Record<string, string | number> | null>(() => {
  if (!pos.value) return null
  return {
    background: props.color,
    height: Math.max(props.stripHeight - 4, 8) + 'px',
    ...(props.draggable ? { cursor: cursor.value ?? 'grab', touchAction: 'none' } : {}),
  }
})

const rayStyle = computed<Record<string, string | number> | null>(() => {
  if (!pos.value) return null
  return { background: props.color, top: props.stripHeight + 'px' }
})

function onContextMenu(e: MouseEvent) {
  emit('contextmenu', { clientX: e.clientX, clientY: e.clientY })
}

function onPointerDown(e: PointerEvent) {
  if (props.draggable) startDrag(e, 'move')
}

function onDblClick() {
  emit('edit')
}
</script>

<template>
  <div
    v-if="pos"
    ref="rootEl"
    class="ms"
    :class="{ 'ms-drag': isDragging }"
    :style="previewStyle ?? pos"
  >
    <div
      class="ms-marker"
      :style="markerStyle"
      @pointerdown="onPointerDown"
      @dblclick="onDblClick"
      @contextmenu.prevent.stop="onContextMenu"
    >
      <TooltipCell :text="title" :multiline="true">
        <span class="ms-hit" />
        <template #popup>
          <BarTooltip
            :title="title"
            :accent="'#fbbc04'"
            :rows="[content, formattedDate].filter((x): x is string => Boolean(x))"
          />
        </template>
      </TooltipCell>
    </div>
    <div v-if="rayStyle" class="ms-ray" :style="rayStyle" />
  </div>
</template>

<style scoped>
.ms {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 3;
}
.ms-marker {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 2px;
  width: 50%;
  min-width: 4px;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  cursor: default;
  pointer-events: auto;
}
.ms-drag .ms-marker {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
}
.ms-marker :deep(.tt-trigger) {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 100%;
  cursor: inherit;
}
.ms-hit {
  display: block;
  width: 100%;
}
.ms-ray {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 2px;
  opacity: 0.9;
  pointer-events: none;
}
</style>
