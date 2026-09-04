<script setup lang="ts">
import { computed } from 'vue'
import type { TimelineCtx } from '../../../composables/timeline-context'
import { cellIndexForDate } from '../calendar'
import {
  LABEL_WIDTH,
  headerHeight,
  CELL_PX_NUM_DAY,
  CELL_PX_NUM_DECADE,
  CELL_PX_WD_DAY,
} from '../layout'

const props = defineProps<{
  t: TimelineCtx
}>()

const dowMap = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

/** Cell number label: for a day — the number; for a decade — the day range (1-10, 11-20, 21-end) */
function numLabel(i: number): string {
  const s = props.t.cellStart(i)
  const e = props.t.cellEnd(i)
  return s.getDate() === e.getDate() ? s.getDate().toString() : `${s.getDate()}-${e.getDate()}`
}

function monthLabel(d: Date): string {
  const m = d.toLocaleDateString('ru', { month: 'long' })
  return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear()
}

/** Months with merged cells — the label is centered over the FULL month width
 *  (from the month's first to last cell), not the visible window, so it does not "float" while scrolling */
const monthGroups = computed(() => {
  const out: { key: string; label: string; from: number; to: number }[] = []
  const seen = new Set<string>()
  for (const i of props.t.visibleIndices) {
    const d = props.t.cellStart(i)
    const key = d.getFullYear() + '-' + d.getMonth()
    if (seen.has(key)) continue
    seen.add(key)
    const firstOfMonth = cellIndexForDate(props.t.origin, props.t.unit, new Date(d.getFullYear(), d.getMonth(), 1))
    const lastOfMonth = cellIndexForDate(props.t.origin, props.t.unit, new Date(d.getFullYear(), d.getMonth() + 1, 0))
    out.push({ key, label: monthLabel(d), from: firstOfMonth, to: lastOfMonth })
  }
  return out
})

/** The number and weekday rows are hidden when the cell is too narrow for their labels */
const showNumRow = computed(() =>
  props.t.cellPx >= (props.t.unit === 'day' ? CELL_PX_NUM_DAY : CELL_PX_NUM_DECADE),
)
const showWdRow = computed(() => props.t.unit === 'day' && props.t.cellPx >= CELL_PX_WD_DAY)
</script>

<template>
  <div class="th-corner"
    :style="{
      width: LABEL_WIDTH + 'px',
      height: headerHeight(t.unit, t.cellPx) + 'px',
      marginBottom: '-' + headerHeight(t.unit, t.cellPx) + 'px',
    }"></div>
  <div class="tg-head" :style="{ height: headerHeight(t.unit, t.cellPx) + 'px' }">

    <div v-for="m in monthGroups" :key="'m' + m.from"
      class="th-month"
      :style="{ left: t.cellLeft(m.from) + 'px', width: (m.to - m.from + 1) * t.cellPx + 'px' }">
      {{ m.label }}
    </div>

    <div v-if="showNumRow" v-for="i in t.visibleIndices" :key="'n' + i"
      class="th-num"
      :style="{ left: t.cellLeft(i) + 'px', width: t.cellPx + 'px' }">
      {{ numLabel(i) }}
    </div>

    <template v-if="showWdRow">
      <div v-for="i in t.visibleIndices" :key="'w' + i"
        class="th-wd"
        :style="{ left: t.cellLeft(i) + 'px', width: t.cellPx + 'px' }">
        {{ dowMap[t.cellStart(i).getDay()] }}
      </div>
    </template>
  </div>
</template>

<style scoped>
@import '../../../styles/tokens.css';
.tg-head {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--ui-surface-2);
}
/* Corner — part of the side panel: sticks to the left and top edges, sits above
 * all side-panel layers (rows 65, merged labels 70, resource codes 80)
 * and the today line (25), but outside the header stacking context (30). Otherwise
 * on vertical scroll group labels pass over it — the corner looks like
 * a "punched-out window". Height and negative margin are set inline so the
 * header is not shifted. */
.th-corner {
  position: sticky;
  top: 0;
  left: 0;
  width: 180px;
  background: var(--ui-surface-2);
  z-index: 90;
  display: flex;
  align-items: center;
  padding: 0 10px;
  box-sizing: border-box;
  font-weight: 700;
  font-size: 12px;
  color: var(--ui-text-2);
  border-right: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
.th-month {
  position: absolute;
  top: 2px;
  height: 18px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-2);
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-surface-2);
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
.th-num {
  position: absolute;
  top: 20px;
  height: 18px;
  font-size: 10px;
  color: var(--ui-text-2);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-left: 1px solid var(--ui-border);
  background: var(--ui-surface-2);
  overflow: hidden;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
.th-wd {
  position: absolute;
  top: 38px;
  height: 18px;
  font-size: 10px;
  color: var(--ui-text-muted);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-left: 1px solid var(--ui-border);
  background: var(--ui-surface-2);
  overflow: hidden;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
</style>
