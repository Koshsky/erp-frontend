<script setup lang="ts">
import { computed, ref } from 'vue'
import { TooltipCell } from '../../common/TooltipCell'
import {
  dateCellIndex,
  cellCount,
  buildCells,
  boundsCellSpan,
  cellSpanToDates,
  clampDateToBounds,
  toDate,
} from '../calendar'
import { useBarDrag } from '../../../composables/useBarDrag'
import type { MilestoneMarkerProps } from './types'

const props = withDefaults(defineProps<MilestoneMarkerProps>(), {
  color: '#fbbc04',
  draggable: true,
})

const emit = defineEmits<{
  change: [payload: { date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  /** Дабл клик по вехе — открыть редактирование */
  edit: []
}>()

const rootEl = ref<HTMLElement | null>(null)

/** Дата вехи в формате для тултипа (локализованная) */
const formattedDate = computed(() => toDate(props.date).toLocaleDateString('ru'))

const cells = () => buildCells(props.anchor, props.mode, props.unit)

/** Границы процесса — веха не перетаскивается за их пределы */
const bounds = computed(() =>
  boundsCellSpan(props.anchor, props.mode, props.unit, props.groupStartDate, props.groupEndDate),
)

/** Драг вехи как точки: спана в одну ячейку, только перемещение */
const { isDragging, cursor, previewStyle, startDrag } = useBarDrag({
  cells,
  getContainer: () => rootEl.value?.parentElement ?? null,
  getSpan: () => {
    const idx = dateCellIndex(props.anchor, props.mode, props.unit, props.date)
    return idx == null ? null : { startCell: idx, endCell: idx + 1 }
  },
  getBounds: () => bounds.value,
  onCommit: (span) => {
    const d = cellSpanToDates(cells(), span.startCell, span.endCell)
    emit('change', {
      date: clampDateToBounds(d.start_date, props.groupStartDate, props.groupEndDate),
    })
  },
})

/** Бокс ячейки вехи — маркер и луч выравниваются по её центру */
const pos = computed<{ left: string; width: string } | null>(() => {
  const index = dateCellIndex(props.anchor, props.mode, props.unit, props.date)
  if (index == null) return null
  const total = cellCount(props.anchor, props.mode, props.unit)
  return {
    left: (index / total) * 100 + '%',
    width: (1 / total) * 100 + '%',
  }
})

const markerStyle = computed<Record<string, string | number> | null>(() => {
  if (!pos.value) return null
  const height = props.headerHeight != null ? props.headerHeight - 4 : null
  return {
    background: props.color,
    ...(height != null ? { height: height + 'px' } : {}),
    ...(props.draggable
      ? { cursor: cursor.value ?? 'grab', touchAction: 'none' }
      : {}),
  }
})

const rayStyle = computed<Record<string, string | number> | null>(() => {
  if (!pos.value || props.headerHeight == null) return null
  return {
    background: props.color,
    top: props.headerHeight + 'px',
  }
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
    :style="previewStyle ?? { left: pos.left, width: pos.width }"
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
          <div class="ms-popup">
            <div class="ms-popup-title">{{ title }}</div>
            <div v-if="content" class="ms-popup-content">{{ content }}</div>
            <div class="ms-popup-date">{{ formattedDate }}</div>
          </div>
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
}
/* Маркер вехи: закруглённый прямоугольник в половину ширины ячейки по центру */
.ms-marker {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 2px;
  bottom: 2px;
  width: 50%;
  border-radius: 4px;
  min-width: 4px;
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
/* Луч-древко: сплошная линия цвета вехи по центру ячейки, от низа шапки до низа блока */
.ms-ray {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 2px;
  opacity: 0.9;
}
</style>

<style>
.ms-popup-title {
  font-weight: 700;
  margin-bottom: 2px;
}
.ms-popup-content {
  color: rgba(255, 255, 255, 0.85);
}
.ms-popup-date {
  color: rgba(255, 255, 255, 0.85);
  margin-top: 4px;
  font-size: 12px;
}
</style>
