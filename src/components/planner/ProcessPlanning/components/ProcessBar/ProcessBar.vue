<script setup lang="ts">
import LabeledBar from '../../../Bar/Bar.vue'
import { GanttTooltip } from '@/components/common'
import type { ProcessBarProps } from './types'

const props = withDefaults(defineProps<ProcessBarProps>(), {
  projectCode: '',
  ownerName: '',
  color: '#1a73e8',
  opacity: 0.85,
  draggable: true,
  groupStartDate: null,
  groupEndDate: null,
  height: 24,
  top: 1,
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
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
    :title="title"
    :projectCode="projectCode"
    :color="color"
    :opacity="opacity"
    :height="height"
    :top="top"
    :minWidth="40"
    padding="0 10px"
    :shadow="true"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @click="() => emit('click')"
  >
    <template #tooltip="{ dateRange }">
      <slot name="tooltip">
        <GanttTooltip
          :title="title"
          :rows="[ownerName ? `Владелец: ${ownerName}` : '', dateRange].filter(Boolean)"
        />
      </slot>
    </template>
  </LabeledBar>
</template>
