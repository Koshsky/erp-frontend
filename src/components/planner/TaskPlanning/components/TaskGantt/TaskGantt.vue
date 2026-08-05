<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import { MilestoneMarker } from '../../../MilestoneMarker'
import TaskBar from './components/TaskBar/TaskBar.vue'
import type { TaskGanttProps } from './types'

const props = withDefaults(defineProps<TaskGanttProps>(), {
  canManage: true,
})

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  'milestone-change': [payload: { id: number; date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }]
  'task-edit': [payload: number]
  'milestone-edit': [payload: number]
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

function onTaskEdit(id: number) {
  if (props.canManage) emit('task-edit', id)
}

function onMilestoneEdit(id: number) {
  if (props.canManage) emit('milestone-edit', id)
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
    mergedLabel
    @contextmenu="onContextMenu"
  >
    <template #label>
      <div v-if="projectCode" class="gl-code">{{ projectCode }}</div>
      <div class="gl-title">{{ title }}</div>
    </template>

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
        :draggable="canManage"
        @change="(d) => emit('milestone-change', { id: ms.id, ...d })"
        @contextmenu="(p) => onMilestoneContextMenu(p, ms.id)"
        @edit="() => onMilestoneEdit(ms.id)"
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
        :draggable="canManage"
        @change="(d) => onBarChange(item.id, d)"
        @contextmenu="(p) => onBarContextMenu(p, item.id)"
        @edit="() => onTaskEdit(item.id)"
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
.gl-code {
  font-size: 16px;
  font-weight: 800;
  line-height: 1.2;
  color: #1a73e8;
  letter-spacing: 0.3px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gl-title {
  font-size: 12px;
  font-weight: 600;
  color: #555;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
