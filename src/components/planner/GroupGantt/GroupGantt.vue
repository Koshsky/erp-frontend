<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GroupGanttProps } from './types'
import { barCells, cellCount, toDate, dateAtPointer } from '../calendar'
import { LABEL_WIDTH, CELL_WIDTH } from '../layout'

const props = withDefaults(defineProps<GroupGanttProps>(), {
  headerBarHeight: 4,
  reorderable: false,
  mergedLabel: false,
})

const emit = defineEmits<{
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number }]
  reorder: [payload: { from: number; to: number }]
}>()

const gridRef = ref<HTMLElement | null>(null)

/** ПКМ по пустому месту группы: эмитим дату под указателем и индекс строки,
 *  в которую нужно вставить новый элемент (строки ниже сдвинутся вниз).
 *  Клики по барам и вехам пропускаем — это не «пустое место». */
function onContextMenu(e: MouseEvent) {
  if (!props.anchor) return
  const target = e.target as HTMLElement
  if (target.closest('.gantt-bar, .gb-handle, .ms, .row-handle')) return
  const date = dateAtPointer(props.anchor, props.mode, props.unit, gridRef.value?.getBoundingClientRect() ?? null, e.clientX)
  if (!date) return
  const rowEl = target.closest('[data-row-index]') as HTMLElement | null
  const rowIndex = rowEl != null ? Number(rowEl.dataset.rowIndex) : props.items.length
  emit('contextmenu', { clientX: e.clientX, clientY: e.clientY, date, rowIndex })
}

// === Вертикальный драг строк (reorder) ===
const draggingFrom = ref<number | null>(null)
const dragTo = ref<number | null>(null)
const dropStyle = ref<{ top: string } | null>(null)
const rowDragCursor = ref(false)

/** Целевой индекс вставки [0..n] по позиции курсора: число строк, середина которых выше курсора */
function targetBoundary(clientY: number): number {
  const rows = gridRef.value?.querySelectorAll<HTMLElement>('.item-label[data-row-index]')
  if (!rows || !rows.length) return 0
  let b = 0
  for (const el of rows) {
    const r = el.getBoundingClientRect()
    if (clientY > r.top + r.height / 2) b += 1
  }
  return b
}

function onRowDragMove(e: PointerEvent) {
  if (draggingFrom.value == null) return
  const b = targetBoundary(e.clientY)
  const n = props.items.length
  // Границы [0, n], индикатор — над строкой с индексом b (в конце — под последней)
  dragTo.value = b
  if (b === 0) {
    const first = gridRef.value?.querySelector<HTMLElement>('.item-label[data-row-index]')
    dropStyle.value = { top: (first?.offsetTop ?? 0) + 'px' }
  } else if (b >= n) {
    const last = gridRef.value?.querySelectorAll<HTMLElement>('.item-label[data-row-index]')[n - 1]
    dropStyle.value = { top: ((last?.offsetTop ?? 0) + (last?.offsetHeight ?? 0)) + 'px' }
  } else {
    const el = gridRef.value?.querySelectorAll<HTMLElement>('.item-label[data-row-index]')[b]
    dropStyle.value = { top: (el?.offsetTop ?? 0) + 'px' }
  }
}

function onRowDragUp() {
  const from = draggingFrom.value
  const b = dragTo.value
  window.removeEventListener('pointermove', onRowDragMove)
  window.removeEventListener('pointerup', onRowDragUp)
  window.removeEventListener('pointercancel', onRowDragUp)
  document.body.style.userSelect = ''
  rowDragCursor.value = false
  draggingFrom.value = null
  dragTo.value = null
  dropStyle.value = null
  if (from == null || b == null) return
  const n = props.items.length
  // Финальная позиция: при сдвиге вниз вставка на позицию на единицу меньше границы
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
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onRowDragMove)
  window.addEventListener('pointerup', onRowDragUp)
  window.addEventListener('pointercancel', onRowDragUp)
}

defineSlots<{
  header(): any
  label(): any
  overlay(props: { headerBarHeight: number }): any
  row(props: { item: any; index: number }): any
  bar(props: { item: any; index: number; count: number }): any
}>()

/** В режиме mergedLabel большая ячейка левой колонки тянется на всю высоту группы */
const mergedLabelStyle = computed<Record<string, string> | null>(() => {
  if (!props.mergedLabel || props.items.length === 0) return null
  return { gridRow: `1 / span ${props.items.length + 1}` }
})

function fmt(d: string | Date | number | null | undefined): string {
  return d ? toDate(d).toLocaleDateString('ru') : ''
}

/** Полупрозрачная подложка границ группы */
const groupOverlayStyle = computed(() => {
  if (!props.groupStartDate || !props.groupEndDate || !props.anchor) return null
  const span = barCells(props.anchor, props.mode, props.unit, props.groupStartDate, props.groupEndDate)
  if (!span) return null
  const total = cellCount(props.anchor, props.mode, props.unit)
  return {
    left: (span.startCell / total) * 100 + '%',
    width: Math.max(((span.endCell - span.startCell) / total) * 100, 0.5) + '%',
  }
})

const gridTemplate = computed(() => {
  const total = props.anchor ? cellCount(props.anchor, props.mode, props.unit) : 0
  return `${LABEL_WIDTH}px repeat(${total}, var(--cell-width, ${CELL_WIDTH}px))`
})
</script>

<template>
  <div class="gg-block" style="gridColumn:1/-1" @contextmenu.prevent="onContextMenu">
    <div ref="gridRef" class="gg-grid" :style="{ gridTemplateColumns: gridTemplate }">
      <div v-if="mergedLabelStyle" class="c lc group-label" :style="mergedLabelStyle">
        <slot name="label" />
      </div>
      <div v-else class="c lc ph-header">
        <slot name="header" />
      </div>

      <!-- Полоса под шапкой + подложка границ -->
      <div class="header-bar-row" style="gridColumn:2/-1" :style="{ minHeight: headerBarHeight + 'px' }">
        <div v-if="groupOverlayStyle" class="group-overlay" :style="groupOverlayStyle" />
      </div>

      <template v-for="(item, index) in items" :key="'gi'+item.id">
        <div v-if="!mergedLabel" class="c lc item-label lc-start" :class="{ ta: index % 2 === 1, 'with-handle': reorderable }" :data-row-index="index">
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
        <div class="bar-cell" :class="{ ta: index % 2 === 1 }" style="gridColumn:2/-1" :data-row-index="index">
          <!-- Подложка границ группы на каждой ячейке -->
          <div v-if="groupOverlayStyle" class="group-overlay" :style="groupOverlayStyle" />
          <slot name="bar" :item="item" :index="index" :count="items.length" />
        </div>
      </template>

      <div v-if="dropStyle" class="drop-line" :style="dropStyle" />
    </div>

    <!-- Слой милестоунов: поверх разметки и баров, но под липкой колонкой названий -->
    <div class="gg-overlay" :style="{ left: LABEL_WIDTH + 'px' }">
      <slot name="overlay" :headerBarHeight="headerBarHeight" />
    </div>
  </div>
</template>

<style scoped>
.gg-block {
  position: relative;
}
.gg-grid {
  display: grid;
  min-width: 0;
  position: relative;
}
.c {
  border: 1px solid #e8e8e8;
  text-align: center;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lc {
  position: sticky; left: 0; background: #fff; z-index: 10;
  text-align: left; padding: 4px 8px !important;
  border-left: none; overflow: hidden;
}

.lc-start {
  justify-content: flex-start;
}
.item-label {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: #333;
  min-height: 36px;
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
.item-label.with-handle {
  padding-left: 24px !important;
}
.row-handle.is-grabbing {
  cursor: grabbing;
  color: #1a73e8;
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
.item-title {
  font-weight: 400;
  color: #444;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ta { background: #fafafa; }
.item-dates {
  font-size: 10px; color: #999; font-weight: 400; margin-top: 1px;
}

.header-bar-row {
  position: relative; min-height: 4px;
  border: 1px solid #e8e8e8; border-top: none;
  overflow: hidden;
}

.bar-cell {
  position: relative; min-height: 36px;
  border: 1px solid #e8e8e8; border-top: none; background: #fff;
  overflow: hidden;
}
.bar-cell.ta { background: #fafafa; }

.group-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.04);
  pointer-events: none;
  z-index: 0;
}

/* Слой-оверлей милестоунов: над разметкой и барами, под липкой колонкой */
.gg-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 5;
  pointer-events: none;
}

.ph-header {
  min-height: 36px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  background: #fafafa;
  font-weight: 700;
  font-size: 13px;
  color: #333;
  border-bottom: 1px solid #ddd;
}

/* Режим mergedLabel: одна большая ячейка левой колонки на всю высоту группы */
.group-label {
  grid-column: 1;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  text-align: left;
  padding: 8px 12px !important;
}
</style>
