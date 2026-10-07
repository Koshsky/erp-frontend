<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { TaskBar } from '../TaskPlanning/components/TaskGantt/components/TaskBar'
import { cellRangeForSpan } from '../calendar'
import { makeDemoTimeline } from '../demoTimeline'
import type { BadgePreviewTask } from './types'

/**
 * Live preview of the bar badges (Settings → Diagrams → "Badges on diagrams").
 *
 * It draws the REAL `TaskBar` over a demo timeline instead of a hand-made copy,
 * so the picture cannot diverge from the planner: the component reads the very
 * same `viewSettings` flags the checkboxes toggle. Dragging is disabled, which
 * also keeps the bar out of the tab order (no `tabindex`, no slider role).
 */
const ORIGIN = '2026-01-01'
const CELL_PX = 32
/**
 * Fourteen day cells — the bar is 448px wide, which fits the settings card
 * (640px) and still has room for every badge the preview demonstrates: with a
 * narrower bar the trailing badges would be cut off by the bar's own edge.
 */
const START_DATE = '2026-01-01'
const END_DATE = '2026-01-14'
const PROJECT_CODE = 'KO-1001'

const timeline = makeDemoTimeline(ORIGIN, 'day', { cellPx: CELL_PX, viewportCells: 16 })

/** Bar width from the planner's own span math, so the frame always fits it. */
const barWidth = computed(() => {
  const span = cellRangeForSpan(ORIGIN, 'day', START_DATE, END_DATE)
  return span ? (span.endCell - span.startCell) * CELL_PX : 0
})

const task = computed<BadgePreviewTask>(() => ({
  id: -1,
  title: t('adminSystem.settings.badges.demoTitle'),
  start_date: START_DATE,
  end_date: END_DATE,
  resources: [
    { resource_id: 1, assignment_id: 1, quantity: 2, code: 'MK', color: '#1A73E8' },
    { resource_id: 2, assignment_id: 2, quantity: 1, code: 'SV' },
  ],
  owner_short: t('adminSystem.settings.badges.demoOwner'),
  owner_name: t('adminSystem.settings.badges.demoOwner'),
  // One of two operations done — the progress badge shows 50%.
  subtasks: [
    { id: -1, status: 'done' },
    { id: -2, status: 'in_progress' },
  ],
  comments_count: 3,
}))
</script>

<template>
  <div class="bbp-preview">
    <div class="bbp-row" :style="{ width: barWidth + 'px' }">
      <TaskBar
        :timeline="timeline"
        :task="task"
        :project-code="PROJECT_CODE"
        :draggable="false"
      />
    </div>
  </div>
</template>

<style scoped>
@import "../../../styles/tokens.css";
.bbp-preview {
  box-sizing: border-box;
  width: max-content;
  max-width: 100%;
  padding: 4px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
}
/* The bar positions itself absolutely: the row is its positioning context. */
.bbp-row {
  position: relative;
  height: 26px;
}
</style>
