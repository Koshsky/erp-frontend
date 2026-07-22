<script setup lang="ts">
const props = defineProps<{
  dayZero: Date | number
  totalDays: number
  startDate: string | Date | number
  endDate: string | Date | number
  color?: string
  opacity?: number
}>()

function toDate(v: Date | number): Date {
  return v instanceof Date ? v : new Date(v)
}

function dayOffset(date: string | Date | number): number {
  const d = date instanceof Date ? date : new Date(date)
  return Math.round((d.getTime() - toDate(props.dayZero).getTime()) / (1000 * 60 * 60 * 24))
}

function barStyle(): Record<string, string | number> {
  const total = props.totalDays
  const startOff = dayOffset(props.startDate)
  const endOff = dayOffset(props.endDate)
  const l = (startOff / total) * 100
  const w = ((endOff - startOff) / total) * 100
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

