<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  dayZero: Date | number
  totalDays: number
  startDate: string | Date | number
  endDate: string | Date | number
  title: string
  projectCode?: string
  color?: string
  opacity?: number
}>()

function toDate(v: Date | number): Date {
  return v instanceof Date ? v : new Date(v)
}

function dayOffset(date: string | Date | number): number {
  const d = date instanceof Date ? date : new Date(date)
  const zero = toDate(props.dayZero)
  const diff = d.getTime() - zero.getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

const barStyle = computed(() => {
  const total = props.totalDays
  const startOff = dayOffset(props.startDate)
  const endOff = dayOffset(props.endDate)
  const l = (startOff / total) * 100
  const w = ((endOff - startOff) / total) * 100
  return {
    left: l + '%',
    width: Math.max(w, 0.5) + '%',
    background: props.color || '#1a73e8',
    opacity: props.opacity ?? 0.85,
  }
})
</script>

<template>
  <div class="process-bar" :style="barStyle">
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

