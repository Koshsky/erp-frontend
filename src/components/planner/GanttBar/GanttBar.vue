<script setup lang="ts">
import { barCells, cellCount } from '../calendar'
import type { PlanningMode, PlanningUnit } from '../calendar'

const props = defineProps<{
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  startDate: string | Date | number
  endDate: string | Date | number
  color?: string
  opacity?: number
}>()

function barStyle(): Record<string, string | number> {
  const { startCell, endCell } = barCells(props.anchor, props.mode, props.unit, props.startDate, props.endDate)
  const total = cellCount(props.anchor, props.mode, props.unit)
  const l = (startCell / total) * 100
  const w = ((endCell - startCell) / total) * 100
  return {
    left: l + '%',
    width: Math.max(w, 0.5) + '%',
    background: props.color || '#34a853',
    opacity: props.opacity ?? 0.75,
  }
}
</script>

<template>
  <div class="gantt-bar" :style="barStyle()">
    <slot />
  </div>
</template>

<style scoped>
.gantt-bar {
  position: absolute;
  top: 5px;
  height: 26px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  min-width: 4px;
  cursor: default;
  transition: opacity .15s;
  overflow: hidden;
  box-sizing: border-box;
}
.gantt-bar:hover { opacity: .95 !important; }
</style>
