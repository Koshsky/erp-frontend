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
  edit: [payload: number]
}>()

const groupItems = computed(() =>
  props.projects.map((p) => ({
    id: p.id,
    title: p.project_code || '',
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

function onBarEdit(id: number) {
  if (props.canManage(id)) emit('edit', id)
}
</script>

<template>
  <GroupGantt
    :timeline="timeline"
    :items="groupItems"
    :reorderable="reorderable"
    @reorder="(p) => emit('reorder', p)"
  >
    <template #bar="{ item }">
      <ProjectBar
        :timeline="timeline"
        :startDate="item.start_date"
        :endDate="item.end_date"
        :projectCode="item.title"
        :priority="item.priority"
        :ownerName="item.owner_name"
        :draggable="canManage(item.id)"
        @change="(d) => onBarChange(item.id, d)"
        @contextmenu="(p) => onContextMenu({ ...p, id: item.id })"
        @edit="() => onBarEdit(item.id)"
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
