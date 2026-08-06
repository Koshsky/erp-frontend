<script setup lang="ts">
import { computed } from 'vue'
import ProcessBar from '../../../ProcessPlanning/components/ProcessBar/ProcessBar.vue'
import { GanttTooltip } from '@/components/common'
import type { ProjectBarProps } from './types'
import { formatDateRange } from '../../../calendar'

const props = withDefaults(defineProps<ProjectBarProps>(), {
  color: '#1a73e8',
  opacity: 0.85,
  draggable: true,
})

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  edit: []
}>()

const dateRange = computed(() => formatDateRange(props.startDate, props.endDate))

/** Строки тултипа проекта: приоритет, владелец, диапазон дат */
const tooltipRows = computed(() => [
  props.priority != null ? `Приоритет: ${props.priority}` : '',
  props.ownerName ? `Владелец: ${props.ownerName}` : '',
  dateRange.value,
].filter(Boolean))
</script>

<template>
  <ProcessBar
    :timeline="timeline"
    :startDate="startDate"
    :endDate="endDate"
    :title="projectCode"
    :color="color"
    :opacity="opacity"
    :height="40"
    :top="6"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @edit="() => emit('edit')"
  >
    <template #tooltip>
      <GanttTooltip :title="projectCode" :rows="tooltipRows" />
    </template>
  </ProcessBar>
</template>
