<script setup lang="ts">
import { computed } from 'vue'
import GanttBar from '../GanttBar/GanttBar.vue'
import { GanttTooltip } from '@/components/common'
import { formatDateRange } from '../calendar'
import type { LabeledBarProps } from './types'

const props = withDefaults(defineProps<LabeledBarProps>(), {
  projectCode: '',
  color: '#34a853',
  opacity: 0.75,
  height: 24,
  top: 1,
  minWidth: 4,
  padding: '0 8px',
  shadow: false,
  draggable: true,
  groupStartDate: null,
  groupEndDate: null,
})

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  edit: []
}>()

/** Диапазон дат бара «дд.мм.гггг — дд.мм.гггг» (для тултипа и слотов) */
const dateRange = computed(() => formatDateRange(props.startDate, props.endDate))
</script>

<template>
  <GanttBar
    :timeline="timeline"
    :startDate="startDate"
    :endDate="endDate"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
    :color="color"
    :opacity="opacity"
    :title="title"
    :height="height"
    :top="top"
    :minWidth="minWidth"
    :padding="padding"
    :shadow="shadow"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @edit="() => emit('edit')"
  >
    <slot>
      <span class="lb-title">{{ title }}</span>
      <span v-if="projectCode" class="lb-code">{{ projectCode }}</span>
    </slot>
    <template #tooltip>
      <slot name="tooltip" :dateRange="dateRange">
        <GanttTooltip :title="title" :rows="[dateRange]" />
      </slot>
    </template>
  </GanttBar>
</template>

<style scoped>
.lb-title {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  pointer-events: none;
}
.lb-code {
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
  padding: 0 5px;
  margin-left: 6px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
