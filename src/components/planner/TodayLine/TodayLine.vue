<script setup lang="ts">
import { computed } from 'vue'
import { cellIndexForDate } from '../calendar'
import { DAY_MS } from '../../../utils'
import type { TodayLineProps } from './types'

const props = withDefaults(defineProps<TodayLineProps>(), {
  color: '#e53935',
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
.tl-line {
  position: absolute;
  top: 0;
  bottom: 0;
  /* Its own level: above the content (bars 2, milestones 3) and resource cells (20),
     but below the calendar header (30) and the side panel (65+): the header, resource
     codes, merged/row labels, the milestone strip and the corner stay on top of
     the today line */
  z-index: 25;
  pointer-events: none;
}
</style>
