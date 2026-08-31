<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import ProjectBar from '../ProjectBar/ProjectBar.vue'
import type { ProjectGanttProps } from './types'

const props = withDefaults(defineProps<ProjectGanttProps>(), {
  reorderable: true,
  canManage: () => true,
})

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; projectId?: number }]
  reorder: [payload: { from: number; to: number }]
  /** Single click on a project bar — switch to that project's processes tab */
  navigate: [payload: number]
}>()

const groupItems = computed(() =>
  props.projects.map((p) => ({
    id: p.id,
    title: p.project_code || '',
    color: p.color || '',
    start_date: p.start_date || '',
    end_date: p.end_date || '',
    priority: p.priority,
    owner_name: p.owner_name,
  })),
)

function onBarChange(id: number, d: { start_date: string; end_date: string }) {
  emit('change', { id, ...d })
}

function onContextMenu(p: { clientX: number; clientY: number; id: number }) {
  emit('contextmenu', { ...p, date: '', rowIndex: -1, projectId: p.id })
}
</script>

<template>
  <GroupGantt
    :timeline="timeline"
    :items="groupItems"
    :reorderable="reorderable"
    :rowHeight="52"
    @reorder="(p) => emit('reorder', p)"
  >
    <template #bar="{ item, startReorder }">
      <ProjectBar
        :timeline="timeline"
        :startDate="item.start_date"
        :endDate="item.end_date"
        :projectCode="item.title"
        :priority="item.priority"
        :ownerName="item.owner_name"
        :color="item.color"
        :draggable="canManage(item.id)"
        :start-row-reorder="reorderable ? startReorder : null"
        @change="(d) => onBarChange(item.id, d)"
        @contextmenu="(p) => onContextMenu({ ...p, id: item.id })"
        @click="() => emit('navigate', item.id)"
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
