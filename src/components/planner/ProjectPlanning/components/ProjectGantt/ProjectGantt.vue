<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import ProjectBar from '../ProjectBar/ProjectBar.vue'
import type { ProjectGanttProps } from './types'

const props = defineProps<ProjectGanttProps>()

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; projectId?: number }]
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

function onContextMenu(p: { clientX: number; clientY: number; date: string; rowIndex: number }) {
  emit('contextmenu', p)
}

function onBarContextMenu(p: { clientX: number; clientY: number }, id: number) {
  emit('contextmenu', { ...p, date: '', rowIndex: -1, projectId: id })
}</script>

<template>
  <GroupGantt
    :anchor="anchor"
    :mode="mode"
    :unit="unit"
    :items="groupItems"
    @contextmenu="onContextMenu"
  >
    <template #bar="{ item }">
      <ProjectBar
        :anchor="anchor!"
        :mode="mode"
        :unit="unit"
        :startDate="item.start_date"
        :endDate="item.end_date"
        :projectCode="item.title"
        :priority="item.priority"
        :ownerName="item.owner_name"
        @change="(d) => onBarChange(item.id, d)"
        @contextmenu="(p) => onBarContextMenu(p, item.id)"
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
