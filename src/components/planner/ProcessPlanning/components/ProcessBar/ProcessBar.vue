<script setup lang="ts">
import { computed } from 'vue'
import { barCells, cellCount } from '../../../calendar'
import type { PlanningMode, PlanningUnit } from '../../../calendar'

const props = defineProps<{
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  startDate: string | Date | number
  endDate: string | Date | number
  title: string
  projectCode?: string
  color?: string
  opacity?: number
}>()

const barStyle = computed<Record<string, string | number> | null>(() => {
  const span = barCells(props.anchor, props.mode, props.unit, props.startDate, props.endDate)
  if (!span) return null
  const total = cellCount(props.anchor, props.mode, props.unit)
  const l = (span.startCell / total) * 100
  const w = ((span.endCell - span.startCell) / total) * 100
  return {
    left: l + '%',
    width: Math.max(w, 0.5) + '%',
    background: props.color || '#1a73e8',
    opacity: props.opacity ?? 0.85,
  }
})
</script>

<template>
  <div v-if="barStyle" class="process-bar" :style="barStyle">
    <div class="pb-content">
      <span class="pb-title">{{ title }}</span>
      <span v-if="projectCode" class="pb-code">{{ projectCode }}</span>
    </div>
  </div>
</template>

<style scoped>
.process-bar {
  position: absolute;
  top: 2px;
  height: 30px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  min-width: 40px;
  cursor: default;
  transition: opacity .15s;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,.15);
  box-sizing: border-box;
}
.process-bar:hover { opacity: .95 !important; }

.pb-content {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.pb-title {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,.3);
}

.pb-code {
  font-size: 10px;
  font-weight: 500;
  color: rgba(255,255,255,.85);
  background: rgba(0,0,0,.15);
  border-radius: 3px;
  padding: 0 5px;
}
</style>
