<script setup lang="ts" generic="Row = unknown">
import { computed, ref, watch } from 'vue'
import type { DataTableColumn, DataTableCellScope, DataTableProps, SortDir } from './types'

const props = withDefaults(defineProps<DataTableProps<Row>>(), {
  emptyText: 'Нет данных',
  expandable: false,
  resizable: false,
  defaultSort: null,
})

const emit = defineEmits<{
  /** Emitted when the sort state changes (key of the sorted column + direction). */
  'update:sort': [sort: { key: string; dir: SortDir } | null]
  /** Emitted on right-click of a data row (native event + the row). */
  'row-contextmenu': [event: MouseEvent, row: Row]
  /** Emitted on click of a data row (native event + the row). */
  'row-click': [event: MouseEvent, row: Row]
  /** Emitted when a column width changes (column key → pixel width). */
  'update:columnWidths': [widths: Record<string, number>]
}>()

defineSlots<{
  /** Toolbar actions (buttons/filters), shown on the right of the title. */
  actions?: () => unknown
  /** Custom cell rendering; default renders `row[column.key]` text. */
  cell?: (scope: DataTableCellScope<Row>) => unknown
  /** Filter row rendered right under the column headers (no row when empty). */
  filters?: () => unknown
  /** Expanded detail row below a row (only with expandable, keyed by row index). */
  expanded?: (scope: { row: Row; index: number }) => unknown
}>()

// --- Column sorting (client-side, cycle: asc → desc → off) -----------------

const sortBy = ref<{ key: string; dir: SortDir } | null>(props.defaultSort)

/** Sort key value for a row: page-provided hook or the raw row field. */
function sortValueOf(row: Row, key: string): unknown {
  if (props.sortValue) return props.sortValue(row, key)
  return (row as Record<string, unknown>)[key]
}

function toggleSort(col: DataTableColumn) {
  if (col.sortable === false) return
  if (sortBy.value?.key === col.key) {
    sortBy.value = sortBy.value.dir === 1 ? { key: col.key, dir: -1 } : null
  } else {
    sortBy.value = { key: col.key, dir: 1 }
  }
  emit('update:sort', sortBy.value)
}

function sortActive(col: DataTableColumn, dir: SortDir): boolean {
  return sortBy.value?.key === col.key && sortBy.value.dir === dir
}

function ariaSort(col: DataTableColumn): 'ascending' | 'descending' | 'none' {
  if (sortBy.value?.key !== col.key) return 'none'
  return sortBy.value.dir === 1 ? 'ascending' : 'descending'
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a ?? '').localeCompare(String(b ?? ''), 'ru')
}

const visibleRows = computed(() => {
  const s = sortBy.value
  if (!s) return props.rows
  return [...props.rows].sort((a, b) => {
    return compareValues(sortValueOf(a, s.key), sortValueOf(b, s.key)) * s.dir
  })
})

// --- Column tracks ----------------------------------------------------------

/**
 * Fixed user widths (drag-resize, persisted by the parent) override the
 * column config; everything else stays content-sized. A trailing 1fr spacer
 * keeps every row's grid area (and the header/hover bands) full-width.
 */
const columnWidths = ref<Record<string, number>>({ ...(props.columnWidths ?? {}) })

watch(
  () => props.columnWidths,
  (value) => {
    if (value) columnWidths.value = { ...value }
  },
)

function setColumnWidth(key: string, widthPx: number) {
  columnWidths.value = { ...columnWidths.value, [key]: widthPx }
  emit('update:columnWidths', columnWidths.value)
}

function clearColumnWidth(key: string) {
  const next = { ...columnWidths.value }
  delete next[key]
  columnWidths.value = next
  emit('update:columnWidths', columnWidths.value)
}

const columnsCss = computed(() => {
  const tracks = props.columns.map((col) => {
    const fixed = columnWidths.value[col.key]
    return fixed ? `${fixed}px` : (col.width ?? 'fit-content(320px)')
  })
  return [...tracks, '1fr'].join(' ')
})

// --- Column resizing (drag on the header edge) ------------------------------

const MIN_COL_WIDTH = 60
const MAX_COL_WIDTH = 1200

let dragState: { key: string; startX: number; baseWidth: number } | null = null

function startResize(e: MouseEvent, col: DataTableColumn) {
  if (!props.resizable) return
  e.preventDefault()
  e.stopPropagation()
  const cell = (e.currentTarget as HTMLElement).closest('.dt-th-cell') as HTMLElement | null
  dragState = { key: col.key, startX: e.clientX, baseWidth: cell?.getBoundingClientRect().width ?? 0 }
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', stopResize, { once: true })
  document.body.classList.add('dt-resizing')
}

function onResizeMove(e: MouseEvent) {
  if (!dragState) return
  const width = Math.round(dragState.baseWidth + e.clientX - dragState.startX)
  setColumnWidth(dragState.key, Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, width)))
}

function stopResize() {
  dragState = null
  document.removeEventListener('mousemove', onResizeMove)
  document.body.classList.remove('dt-resizing')
}

/** Double-click on the handle: back to the content-sized width. */
function resetResize(col: DataTableColumn) {
  clearColumnWidth(col.key)
}

/** Default cell text: '—' for empty values. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

// --- Expandable rows --------------------------------------------------------

const expandedIndex = ref<number | null>(null)

function onRowClick(event: MouseEvent, row: Row, index: number) {
  if (props.expandable) {
    expandedIndex.value = expandedIndex.value === index ? null : index
  }
  emit('row-click', event, row)
}
</script>

<template>
  <!-- Card frame: the toolbar stays put while only the table area below it
       scrolls horizontally (toolbar must not travel with the columns). -->
  <div class="dt-card">
    <!-- Row 1: toolbar — title + actions (room for future buttons) -->
    <div class="dt-tbar">
      <h2 v-if="title" class="dt-tbar-title">{{ title }}</h2>
      <div class="dt-tbar-actions">
        <slot name="actions" />
      </div>
    </div>

    <!-- Scroll wrapper: when the columns are wider than the card it scrolls
         horizontally instead of letting the grid squeeze the tracks
         (squeezing with overflow-wrap: anywhere would collapse tracks to
         one-character width — "vertical text"). -->
    <div class="dt-scroll">
      <div class="dt-table" :style="{ gridTemplateColumns: columnsCss }">
        <!-- Row 2: column headers with sort indicators -->
        <div class="dt-tr dt-th">
          <template v-for="col in columns" :key="col.key">
            <button
              v-if="col.sortable !== false"
              type="button"
              class="dt-th-cell"
              :aria-sort="ariaSort(col)"
              @click="toggleSort(col)"
            >
              <span>{{ col.label }}</span>
              <span class="dt-sort" aria-hidden="true">
                <i :class="{ on: sortActive(col, 1) }">▲</i><i :class="{ on: sortActive(col, -1) }">▼</i>
              </span>
              <span
                v-if="resizable"
                class="dt-resizer"
                title="Изменить ширину колонки"
                @mousedown.prevent.stop="startResize($event, col)"
                @dblclick.prevent.stop="resetResize(col)"
              ></span>
            </button>
            <div v-else class="dt-th-cell">
              {{ col.label }}
              <span
                v-if="resizable"
                class="dt-resizer"
                title="Изменить ширину колонки"
                @mousedown.prevent.stop="startResize($event, col)"
                @dblclick.prevent.stop="resetResize(col)"
              ></span>
            </div>
          </template>
        </div>

        <!-- Row 3: optional filter row (rendered only when the slot is used) -->
        <div v-if="$slots.filters" class="dt-tr dt-filters">
          <slot name="filters" />
        </div>

        <!-- Data rows -->
        <template v-for="(row, i) in visibleRows" :key="i">
          <div
            class="dt-tr"
            :class="{ 'dt-tr--open': expandable && expandedIndex === i }"
            @contextmenu.prevent.stop="emit('row-contextmenu', $event, row)"
            @click="onRowClick($event, row, i)"
          >
            <div v-for="col in columns" :key="col.key" class="dt-cell">
              <slot name="cell" :row="row" :column="col">{{ formatValue((row as Record<string, unknown>)[col.key]) }}</slot>
            </div>
          </div>

          <!-- Expanded detail row below the open row -->
          <div v-if="$slots.expanded && expandable && expandedIndex === i" class="dt-tr dt-detail">
            <slot name="expanded" :row="row" :index="i" />
          </div>
        </template>

        <p v-if="!visibleRows.length" class="dt-empty">{{ emptyText }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import '../../../styles/tokens.css';

/* Card frame: rounded corners + shadow; the toolbar is a fixed top band,
   only the .dt-scroll area below it scrolls horizontally. */
.dt-card {
  width: 100%;
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  overflow: hidden;
}

/* Toolbar — row 1: title + actions. Lives outside the scroll area, so it
   never travels with the columns during horizontal scrolling. */
.dt-tbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--ui-border);
}
.dt-tbar-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-text);
}
.dt-tbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Scroll wrapper: when the columns are wider than the card, the grid is
   allowed to grow (width: max-content) and this area scrolls — tracks never
   squeeze below their caps. */
.dt-scroll {
  overflow-x: auto;
}
/* min-width: 100% keeps the table full-width when there are few columns
   (header/hover bands still span edge-to-edge via the 1fr spacer). */
.dt-table {
  display: grid;
  align-items: center;
  width: max-content;
  min-width: 100%;
}

/* Rows are full-width grid items inheriting the container's column tracks
   (subgrid): header band, separators and hover highlight span the whole
   card instead of stopping at the last data column. */
.dt-tr {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  border-bottom: 1px solid var(--ui-border);
}
.dt-tr:last-child {
  border-bottom: none;
}
.dt-cell,
.dt-th-cell {
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 12px 20px;
  font-size: 14px;
}
.dt-tr:hover {
  background: var(--ui-surface-2);
}

/* Column headers — row 2: solid full-width band */
.dt-th {
  background: var(--ui-surface-2);
}
.dt-th-cell {
  font-weight: 600;
  color: var(--ui-text-muted);
}
button.dt-th-cell {
  border: none;
  /* Buttons get a UA buttonface background by default — make them
     transparent so header cells match the solid .dt-th band. */
  background: transparent;
  font: inherit;
  font-weight: 600;
  color: inherit;
  text-align: left;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  cursor: pointer;
}
button.dt-th-cell:hover {
  color: var(--ui-text);
}

/* Filter row — directly under the headers; cells align with the columns
   via the shared subgrid tracks. */
.dt-filters {
  background: var(--ui-surface-2);
}
.dt-filters > * {
  min-width: 0;
  padding: 8px 20px;
  font-size: 12px;
}

/* Expanded/open row highlight + the detail row below it */
.dt-tr--open {
  background: var(--ui-surface-2);
}
.dt-detail {
  background: var(--ui-surface-2);
}
.dt-detail:last-child {
  border-bottom: none;
}

/* Sort indicators: ▲/▼ pair per header, active direction highlighted. */
.dt-sort {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  font-size: 8px;
  line-height: 1;
  color: var(--ui-text-faint);
  opacity: 0.6;
}
.dt-sort i {
  font-style: normal;
}
.dt-sort i.on {
  color: var(--ui-accent);
  opacity: 1;
}

/* Column resize handle on the right edge of every header cell: an 8px hit
   zone centered on the column border, with a visible divider line. */
.dt-th-cell {
  position: relative;
}
.dt-resizer {
  position: absolute;
  top: 0;
  right: -4px;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 2;
}
/* The visible vertical line on the column border — dark enough to be seen
   on the header band (a border-strong color would be invisible against it). */
.dt-resizer::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 25%;
  bottom: 25%;
  width: 2px;
  transform: translateX(-50%);
  background: var(--ui-text-faint);
}
.dt-resizer:hover::before {
  top: 0;
  bottom: 0;
  background: var(--ui-accent);
}
/* The last column has no neighbor — no divider/crosshair there. */
.dt-th > :last-child .dt-resizer {
  display: none;
}
/* Global resize cursor while a drag is in progress */
:global(body.dt-resizing),
:global(body.dt-resizing *) {
  cursor: col-resize !important;
  user-select: none;
}

/* Empty state spans the whole grid */
.dt-empty {
  grid-column: 1 / -1;
  color: var(--ui-text-muted);
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
</style>