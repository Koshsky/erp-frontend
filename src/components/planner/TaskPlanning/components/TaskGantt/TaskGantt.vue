<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import { MilestoneMarker } from '../../../MilestoneMarker'
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
    :headerBarHeight="36"
  >
    <template #header>
      <span class="header-title">{{ title }}</span>
      <span v-if="projectCode" class="header-code">{{ projectCode }}</span>
    </template>

    <template #overlay="{ headerBarHeight }">
      <MilestoneMarker
        v-for="ms in milestones"
        :key="ms.id"
        :anchor="anchor!"
        :mode="mode"
        :unit="unit"
        :date="ms.date"
        :title="ms.title"
        :content="ms.content"
        :color="ms.color"
        :headerHeight="headerBarHeight"
      />
    </template>

    <template #bar="{ item }">
      <TaskBar :anchor="anchor" :mode="mode" :unit="unit" :task="item" />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
