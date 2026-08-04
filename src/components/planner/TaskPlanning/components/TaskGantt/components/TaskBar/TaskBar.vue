<script setup lang="ts">
import { computed } from 'vue'
import GanttBar from '../../../../../GanttBar/GanttBar.vue'
import type { Task } from './types'
import type { PlanningMode, PlanningUnit } from '../../../../../calendar'
import { toDate } from '../../../../../calendar'

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
  contextmenu: [payload: { clientX: number; clientY: number }]
}>()

const resourcesText = computed(() => {
  if (!props.task.resources || !props.task.resources.length) return '—'
  return props.task.resources.map(r => `${r.quantity}×${r.code || '?'}`).join(', ')
})

const dateRange = computed(() =>
  `${toDate(props.task.start_date).toLocaleDateString('ru')} — ${toDate(props.task.end_date).toLocaleDateString('ru')}`,
)
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
    @contextmenu="(p) => emit('contextmenu', p)"
  >
    <span class="tb-label">{{ resourcesText }}</span>
    <template #tooltip>
      <div class="gb-tooltip">
        <div class="gb-tooltip-title">{{ task.title }}</div>
        <div class="gb-tooltip-row">{{ dateRange }}</div>
        <div v-if="task.resources && task.resources.length" class="gb-tooltip-resources">
          <div v-for="r in task.resources" :key="r.resource_id" class="gb-tooltip-row">
            {{ r.title || r.code }} × {{ r.quantity }}
          </div>
        </div>
      </div>
    </template>
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
