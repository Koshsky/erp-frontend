<script setup lang="ts">
import ProcessBar from '../../../ProcessPlanning/components/ProcessBar/ProcessBar.vue'
import type { ProjectBarProps } from './types'

withDefaults(defineProps<ProjectBarProps>(), {
  color: '#1a73e8',
  opacity: 0.85,
  draggable: true,
})

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
}>()
</script>

<template>
  <ProcessBar
    :anchor="anchor"
    :mode="mode"
    :unit="unit"
    :startDate="startDate"
    :endDate="endDate"
    :title="projectCode"
    :color="color"
    :opacity="opacity"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
  />
</template>
