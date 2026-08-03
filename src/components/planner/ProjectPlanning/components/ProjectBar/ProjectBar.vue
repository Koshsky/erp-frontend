<script setup lang="ts">
import ProcessBar from '../../../ProcessPlanning/components/ProcessBar/ProcessBar.vue'
import type { ProjectBarProps } from './types'

defineProps<ProjectBarProps>()
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
  />
</template>
