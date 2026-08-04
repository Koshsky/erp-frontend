<script setup lang="ts">
import GanttBar from '../../../GanttBar/GanttBar.vue'
import type { ProcessBarProps } from './types'

withDefaults(defineProps<ProcessBarProps>(), {
  projectCode: '',
  color: '#1a73e8',
  opacity: 0.85,
  draggable: true,
  groupStartDate: null,
  groupEndDate: null,
})

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
}>()
</script>

<template>
  <GanttBar
    :anchor="anchor"
    :mode="mode"
    :unit="unit"
    :startDate="startDate"
    :endDate="endDate"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
    :color="color"
    :opacity="opacity"
    :title="title"
    :height="30"
    :top="2"
    :minWidth="40"
    padding="0 10px"
    :shadow="true"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
  >
    <span class="pb-title">{{ title }}</span>
    <span v-if="projectCode" class="pb-code">{{ projectCode }}</span>
  </GanttBar>
</template>

<style scoped>
.pb-title {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  pointer-events: none;
}
.pb-code {
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
