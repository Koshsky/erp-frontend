<script setup lang="ts">
import ProcessBar from '../../../ProcessPlanning/components/ProcessBar/ProcessBar.vue'
import type { ProjectBarProps } from './types'

defineProps<ProjectBarProps>()
</script>

<template>
  <ProcessBar
    :dayZero="dayZero"
    :totalDays="totalDays"
    :startDate="startDate"
    :endDate="endDate"
    :title="projectCode"
    :projectCode="projectCode"
    :color="color"
    :opacity="opacity"
  />
</template>
