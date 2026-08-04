<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import { MilestoneMarker } from '../../../MilestoneMarker'
import TaskBar from './components/TaskBar/TaskBar.vue'
import type { TaskGanttProps } from './types'

const props = defineProps<TaskGanttProps>()

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  'milestone-change': [payload: { id: number; date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }]
}>()

const groupItems = computed(() => props.tasks)

function onBarChange(id: number, d: { start_date: string; end_date: string }) {
  emit('change', { id, ...d })
}

function onContextMenu(p: { clientX: number; clientY: number; date: string; rowIndex: number }) {
  emit('contextmenu', { ...p, processId: props.processId })
}

function onBarContextMenu(p: { clientX: number; clientY: number }, id: number) {
  emit('contextmenu', { ...p, date: '', rowIndex: -1, processId: props.processId, taskId: id })
}

function onMilestoneContextMenu(p: { clientX: number; clientY: number }, id: number) {
  emit('contextmenu', { ...p, date: '', rowIndex: -1, processId: props.processId, milestoneId: id })
}
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
    @contextmenu="onContextMenu"
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
        :groupStartDate="groupStartDate"
        :groupEndDate="groupEndDate"
        @change="(d) => emit('milestone-change', { id: ms.id, ...d })"
        @contextmenu="(p) => onMilestoneContextMenu(p, ms.id)"
      />
    </template>

    <template #bar="{ item }">
      <TaskBar
        :anchor="anchor"
        :mode="mode"
        :unit="unit"
        :task="item"
        :groupStartDate="groupStartDate"
        :groupEndDate="groupEndDate"
        @change="(d) => onBarChange(item.id, d)"
        @contextmenu="(p) => onBarContextMenu(p, item.id)"
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
