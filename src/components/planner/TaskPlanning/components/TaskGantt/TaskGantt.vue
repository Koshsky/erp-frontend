<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import TaskBar from './components/TaskBar/TaskBar.vue'
import type { TaskGanttProps } from './types'

const props = defineProps<TaskGanttProps>()

const groupItems = computed(() => props.tasks)
</script>

<template>
  <GroupGantt
    :anchor="anchor"
    :mode="mode"
    :unit="unit"
    :items="groupItems"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
  >
    <template #header>
      <span class="header-title">{{ title }}</span>
      <span v-if="projectCode" class="header-code">{{ projectCode }}</span>
    </template>

    <template #bar="{ item }">
      <TaskBar :anchor="anchor" :mode="mode" :unit="unit" :task="item" />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
