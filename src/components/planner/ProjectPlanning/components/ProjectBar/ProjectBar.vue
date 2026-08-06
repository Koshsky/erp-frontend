<script setup lang="ts">
import LabeledBar from '../../../Bar/Bar.vue'
import { GanttTooltip } from '@/components/common'
import type { ProjectBarProps } from './types'

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
</script>

<template>
  <LabeledBar
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
    <template #tooltip="{ dateRange }">
      <GanttTooltip
        :title="projectCode"
        :rows="[
          priority != null ? `Приоритет: ${priority}` : '',
          ownerName ? `Владелец: ${ownerName}` : '',
          dateRange,
        ].filter(Boolean)"
      />
    </template>
  </LabeledBar>
</template>
