<script setup lang="ts">
import { computed } from 'vue'
import GanttBar from '../../../../../GanttBar/GanttBar.vue'
import type { Task } from './types'
import type { PlanningMode, PlanningUnit } from '../../../../../calendar'

const props = withDefaults(
  defineProps<{
    anchor: Date | number | null
    mode: PlanningMode
    unit: PlanningUnit
    task: Task
    draggable?: boolean
    /** Границы процесса — ограничивают перетаскивание задачи */
    groupStartDate?: string | Date | number | null
    groupEndDate?: string | Date | number | null
  }>(),
  {
    draggable: true,
    groupStartDate: null,
    groupEndDate: null,
  },
)

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
}>()

const resourcesText = computed(() => {
  if (!props.task.resources || !props.task.resources.length) return '—'
  return props.task.resources.map(r => `${r.quantity}×${r.code || '?'}`).join(', ')
})
</script>

<template>
  <GanttBar
    :anchor="anchor!"
    :mode="mode"
    :unit="unit"
    :startDate="task.start_date"
    :endDate="task.end_date"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
  >
    <span class="tb-label">{{ resourcesText }}</span>
  </GanttBar>
</template>

<style scoped>
.tb-label {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}
</style>
