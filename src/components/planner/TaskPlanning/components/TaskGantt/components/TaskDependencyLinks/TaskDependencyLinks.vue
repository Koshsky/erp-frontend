<script setup lang="ts">
import { computed } from 'vue'
import { cellIndexForDate } from '../../../../../calendar'
import type { TaskDependencyLinksProps, DependencyArrow } from './types'

const props = withDefaults(defineProps<TaskDependencyLinksProps>(), {
  dependencies: () => [],
})

/** Row geometry: the milestone strip takes 20px on top, rows are 26px high. */
const ROW_H = 26
const TOP_PAD = 20
/** Bars are drawn with a tiny inset from the cell edge. */
const BAR_INSET = 2

/** Row center Y of a task (top-level row index). */
const rowIndex = computed(() => {
  const m = new Map<number, number>()
  props.tasks.forEach((t, i) => m.set(t.id, i))
  return m
})

/** Absolute pixel X of a DATE's cell in the group container coordinates. */
function cellX(date: string): number {
  const idx = cellIndexForDate(props.timeline.origin, props.timeline.unit, date)
  return props.timeline.cellLeft(idx)
}

/** X of the bar's left edge (start date cell, small inset). */
function leftX(t: { start_date: string }): number {
  return cellX(t.start_date) + BAR_INSET
}

/** X of the bar's right edge (end date cell + cell width, small inset). */
function rightX(t: { end_date: string }): number {
  return cellX(t.end_date) + props.timeline.cellPx - BAR_INSET
}

/**
 * Elbow arrows between rows (fs/ss/ff/sf — same anchors as the constraint
 * engine): the link starts at the predecessor's anchor edge and ends at the
 * successor's bound edge. Rows/bars only exist for top-level tasks, so links
 * involving other rows are skipped.
 */
const arrows = computed<DependencyArrow[]>(() => {
  const out: DependencyArrow[] = []
  const idx = rowIndex.value
  for (const e of props.dependencies) {
    const predIdx = idx.get(e.depends_on_task_id)
    const succIdx = idx.get(e.task_id)
    if (predIdx == null || succIdx == null) continue
    const pred = props.tasks[predIdx]
    const succ = props.tasks[succIdx]

    const anchorX = e.type === 'fs' || e.type === 'ff' ? rightX(pred) : leftX(pred)
    const boundX = e.type === 'fs' || e.type === 'ss' ? leftX(succ) : rightX(succ)
    const yP = TOP_PAD + predIdx * ROW_H + ROW_H / 2
    const yS = TOP_PAD + succIdx * ROW_H + ROW_H / 2

    // Vertical segments at the row edges; the horizontal segment at the
    // vertical midpoint between the two rows.
    const midY = (yP + yS) / 2
    out.push({
      key: `${e.id}`,
      points: `${anchorX},${yP} ${anchorX},${midY} ${boundX},${midY} ${boundX},${yS}`,
      tipX: boundX,
      tipY: yS,
      dir: boundX >= anchorX ? 1 : -1,
    })
  }
  return out
})

/** Arrowhead triangle points at the tip (direction: right or left). */
function arrowHead(a: DependencyArrow): string {
  const s = 4
  if (a.dir > 0) {
    return `${a.tipX},${a.tipY} ${a.tipX - s},${a.tipY - s} ${a.tipX - s},${a.tipY + s}`
  }
  return `${a.tipX},${a.tipY} ${a.tipX + s},${a.tipY - s} ${a.tipX + s},${a.tipY + s}`
}
</script>

<template>
  <svg
    v-if="arrows.length"
    class="tdl-links"
    aria-hidden="true"
  >
    <path
      v-for="a in arrows"
      :key="a.key"
      class="tdl-path"
      :d="`M ${a.points}`"
    />
    <polygon
      v-for="a in arrows"
      :key="'t' + a.key"
      class="tdl-head"
      :points="arrowHead(a)"
    />
  </svg>
</template>

<style scoped>
@import "../../../../../../../styles/tokens.css";
.tdl-links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  z-index: 3;
}
.tdl-path {
  fill: none;
  stroke: var(--ui-text-muted);
  stroke-width: 1.5;
  opacity: 0.85;
}
.tdl-head {
  fill: var(--ui-text-muted);
  opacity: 0.85;
}
</style>