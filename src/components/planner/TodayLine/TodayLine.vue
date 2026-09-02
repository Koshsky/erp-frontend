<script setup lang="ts">
import { computed } from 'vue'
import { cellIndexForDate } from '../calendar'
import { DAY_MS } from '../../../utils'
import type { TodayLineProps } from './types'

const props = withDefaults(defineProps<TodayLineProps>(), {
  color: 'var(--ui-today)',
  width: 2,
  offset: 0,
})

/** Absolute index of the cell containing today */
const todayIdx = computed(() =>
  cellIndexForDate(props.timeline.origin, props.timeline.unit, new Date()),
)
/** The ray hides outside the visible window (±margin, like bars) */
const visible = computed(() => {
  const t = props.timeline
  return todayIdx.value > t.windowStart - 4 && todayIdx.value < t.windowStart + t.viewportCells + 4
})

/**
 * Position of the "yesterday/today" boundary in content pixels:
 * day — the left edge of the "today" cell (day boundary); decade — the fractional
 * position of the current day inside the decade cell.
 */
const left = computed<number | null>(() => {
  if (!visible.value) return null
  const t = props.timeline
  const i = todayIdx.value
  const frac =
    t.unit === 'decade'
      ? (new Date().getTime() - t.cellStart(i).getTime()) / (t.cellEnd(i).getTime() - t.cellStart(i).getTime() + DAY_MS)
      : 0
  return t.cellLeft(i) + frac * t.cellPx + props.offset
})

const lineStyle = computed<Record<string, string> | null>(() =>
  left.value != null
    ? {
        left: left.value + 'px',
        width: props.width + 'px',
        background: props.color,
      }
    : null,
)
</script>

<template>
  <div v-if="lineStyle" class="tl-line" :style="lineStyle" />
</template>

<style scoped>
@import "../../../styles/tokens.css";
.tl-line {
  position: absolute;
  top: 0;
  bottom: 0;
  /* Its own level: above the content (bars 2, milestones 3), the resource
     cells (20) and the calendar date header (30) — the line crosses the
     header on top. Still below the scale badge (50) and the side-panel
     label layers (65/70/80/90: merged/row labels, resource codes, corner),
     and below popups (30000+). The label layers never overlap the line in X
     (it starts after LABEL_WIDTH), but keep the ordering strict anyway. */
  z-index: 35;
  pointer-events: none;
}
</style>
