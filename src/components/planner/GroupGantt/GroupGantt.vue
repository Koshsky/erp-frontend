<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { GroupGanttProps } from './types'
import { cellRangeForSpan, toDate } from '../calendar'
import { LABEL_WIDTH } from '../layout'
import { useWindowPointerTrack } from '../../../utils'

const props = withDefaults(defineProps<GroupGanttProps>(), {
  reorderable: false,
  mergedLabel: false,
  groupId: null,
  groupStartDate: null,
  groupEndDate: null,
  rowHeight: 26,
  minLabelHeight: 0,
})

const groupEl = ref<HTMLElement | null>(null)

const emit = defineEmits<{
  reorder: [payload: { from: number; to: number }]
}>()

/** Подложка границ группы на шкале (одна на группу, за строками) */
const overlayStyle = computed(() => {
  const span = cellRangeForSpan(
    props.timeline.origin,
    props.timeline.unit,
    props.groupStartDate ?? '',
    props.groupEndDate ?? '',
  )
  if (!span) return null
  const t = props.timeline
  return {
    left: t.cellLeft(span.startCell) + 'px',
    width: (span.endCell - span.startCell) * t.cellPx + 'px',
  }
})

/** Высота объединённого лейбла = вся группа (строки фиксированной высоты),
 *  но не меньше minLabelHeight — чтобы при 0–1 строках код/имя/даты не сжимались */
const mergedHeight = computed(() =>
  Math.max(props.items.length * props.rowHeight, props.minLabelHeight) + 'px',
)

// === Вертикальный драг строк (reorder) ===
const draggingFrom = ref<number | null>(null)
const dragTo = ref<number | null>(null)
const dropStyle = ref<{ top: string } | null>(null)
const rowDragCursor = ref(false)

/** Строки только своей группы (на странице может быть несколько .gg-group) */
function groupRows(): HTMLElement[] {
  return Array.from(groupEl.value?.querySelectorAll('.gg-row[data-row-index]') ?? [])
}

/** Целевой индекс вставки [0..n] по позиции курсора: число строк, середина которых выше курсора */
function targetBoundary(clientY: number): number {
  const rows = groupRows()
  if (!rows.length) return 0
  let b = 0
  for (const el of rows) {
    const r = el.getBoundingClientRect()
    if (clientY > r.top + r.height / 2) b += 1
  }
  return b
}

function onRowDragMove(e: PointerEvent) {
  if (draggingFrom.value == null) return
  const rows = groupRows()
  const b = targetBoundary(e.clientY)
  const n = props.items.length
  dragTo.value = b
  if (b === 0) {
    const first = rows[0]
    dropStyle.value = { top: (first?.offsetTop ?? 0) + 'px' }
  } else if (b >= n) {
    const last = rows[n - 1]
    dropStyle.value = { top: ((last?.offsetTop ?? 0) + (last?.offsetHeight ?? 0)) + 'px' }
  } else {
    const el = rows[b]
    dropStyle.value = { top: (el?.offsetTop ?? 0) + 'px' }
  }
}

function endRowDrag() {
  track.stop()
  rowDragCursor.value = false
  draggingFrom.value = null
  dragTo.value = null
  dropStyle.value = null
}

function onRowDragUp() {
  const from = draggingFrom.value
  const b = dragTo.value
  endRowDrag()
  if (from == null || b == null) return
  const n = props.items.length
  const to = b > from ? b - 1 : b
  if (to >= 0 && to < n && to !== from) emit('reorder', { from, to })
}

function startRowDrag(e: PointerEvent, from: number) {
  if (e.button !== 0 || e.ctrlKey || e.metaKey) return
  if (!props.reorderable || props.items.length < 2) return
  e.preventDefault()
  e.stopPropagation()
  draggingFrom.value = from
  dragTo.value = from
  rowDragCursor.value = true
  track.start()
}

const track = useWindowPointerTrack({
  onMove: onRowDragMove,
  onUp: onRowDragUp,
  onCancel: endRowDrag,
})

defineSlots<{
  label(): any
  row(props: { item: any; index: number }): any
  bar(props: { item: any; index: number; count: number }): any
}>()

// Размонтирование посреди драга строки (смена данных/страницы):
// без этого слушатели и userSelect=«none» остаются навсегда.
onBeforeUnmount(endRowDrag)

function fmt(d: string | Date | number | null | undefined): string {
  return d ? toDate(d).toLocaleDateString('ru') : ''
}
</script>

<template>
  <div ref="groupEl" class="gg-group" :data-group="groupId ?? ''" :data-rows="items.length" :style="{ minHeight: mergedHeight }">
    <div v-if="overlayStyle" class="gg-overlay" :style="overlayStyle" />

    <!-- Объединённый лейбл группы (код объекта + процесс): липкий слева, на всю высоту -->
    <div
      v-if="mergedLabel"
      class="gg-merged"
      :style="{ height: mergedHeight, marginBottom: '-' + mergedHeight }"
    >
      <slot name="label" />
    </div>

    <template v-for="(item, index) in items" :key="'gi' + item.id">
      <div class="gg-row" :style="{ height: rowHeight + 'px' }" :data-row-index="index">
        <div v-if="!mergedLabel" class="gg-label" :class="{ 'with-handle': reorderable }">
          <span
            v-if="reorderable"
            class="row-handle"
            :class="{ 'is-grabbing': rowDragCursor && draggingFrom === index }"
            :title="'Перетащить для смены приоритета'"
            @pointerdown.stop="startRowDrag($event, index)"
          >⠿</span>
          <slot name="row" :item="item" :index="index">
            <span class="item-title">{{ item.title }}</span>
            <div class="item-dates">{{ fmt(item.start_date) }} — {{ fmt(item.end_date) }}</div>
          </slot>
        </div>
        <div class="gg-bars">
          <slot name="bar" :item="item" :index="index" :count="items.length" />
        </div>
      </div>
    </template>

    <div v-if="dropStyle" class="drop-line" :style="dropStyle" />
  </div>
</template>

<style scoped>
.gg-group {
  position: relative;
}
.gg-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.04);
  pointer-events: none;
  z-index: 0;
}
.gg-merged {
  position: sticky;
  left: 0;
  width: 180px;
  background: #fff;
  z-index: 11;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  padding: 4px 12px;
  box-sizing: border-box;
  border-right: 1px solid #f0f0f0;
  border-bottom: 1px solid #e0e0e0;
}
.gg-row {
  position: relative;
}
.gg-label {
  position: sticky;
  left: 0;
  width: 180px;
  height: 100%;
  background: #fff;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: #333;
  padding: 1px 8px;
  border-right: 1px solid #f0f0f0;
  border-bottom: 1px solid #e8e8e8;
  box-sizing: border-box;
  overflow: hidden;
}
.gg-label.with-handle {
  padding-left: 24px;
}
.row-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  display: flex;
  align-items: center;
  color: #bbb;
  font-size: 14px;
  padding: 0 3px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.row-handle:hover {
  color: #1a73e8;
  background: rgba(26, 115, 232, 0.08);
}
.row-handle.is-grabbing {
  cursor: grabbing;
  color: #1a73e8;
}
.item-title {
  font-weight: 400;
  font-size: 11px;
  color: #444;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-dates {
  font-size: 9px;
  color: #999;
  font-weight: 400;
  margin-top: 1px;
}
.gg-bars {
  position: absolute;
  inset: 0;
  z-index: 2;
}
.drop-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: #1a73e8;
  z-index: 12;
  pointer-events: none;
}
</style>
