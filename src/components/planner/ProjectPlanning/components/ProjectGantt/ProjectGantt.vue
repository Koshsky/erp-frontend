<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import ProjectBar from '../ProjectBar/ProjectBar.vue'
import type { ProjectGanttProps } from './types'

const props = defineProps<ProjectGanttProps>()

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
}>()

const groupItems = computed(() =>
  props.projects.map((p) => ({
    id: p.id,
    title: p.project_code || '',
    start_date: p.start_date || '',
    end_date: p.end_date || '',
  })),
)

function onBarChange(id: number, d: { start_date: string; end_date: string }) {
  emit('change', { id, ...d })
}
</script>

<template>
  <GroupGantt
    :anchor="anchor"
    :mode="mode"
    :unit="unit"
    :items="groupItems"
  >
    <template #bar="{ item }">
      <ProjectBar
        :anchor="anchor!"
        :mode="mode"
        :unit="unit"
        :startDate="item.start_date"
        :endDate="item.end_date"
        :projectCode="item.title"
        @change="(d) => onBarChange(item.id, d)"
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
