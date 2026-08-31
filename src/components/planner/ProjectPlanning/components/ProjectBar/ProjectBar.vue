<script setup lang="ts">
import LabeledBar from '../../../Bar/Bar.vue'
import { BarTooltip } from '@/components/common'
import type { ProjectBarProps } from './types'

const props = withDefaults(defineProps<ProjectBarProps>(), {
  color: 'var(--ui-gantt-project)',
  opacity: 0.85,
  draggable: true,
})

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  click: []
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
    :start-row-reorder="startRowReorder"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @click="() => emit('click')"
  >
    <template #tooltip="{ dateRange }">
      <BarTooltip
        :title="projectCode"
        :accent="'var(--ui-gantt-project)'"
        :rows="[
          priority != null ? `Приоритет: ${priority}` : '',
          ownerName ? `Владелец: ${ownerName}` : '',
          dateRange,
        ].filter(Boolean)"
      />
    </template>
  </LabeledBar>
</template>

<style scoped>
@import '../../../../../styles/tokens.css';
</style>
