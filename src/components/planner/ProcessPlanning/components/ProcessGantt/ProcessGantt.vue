<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import ProcessBar from '../ProcessBar/ProcessBar.vue'
import type { ProcessGanttProps } from './types'

const props = defineProps<ProcessGanttProps>()

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; projectId?: number }]
}>()

const groupItems = computed(() => props.processes)

function onBarChange(id: number, d: { start_date: string; end_date: string }) {
  emit('change', { id, ...d })
}

function onContextMenu(p: { clientX: number; clientY: number; date: string; rowIndex: number }) {
  emit('contextmenu', { ...p, projectId: props.projectId })
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
    @contextmenu="onContextMenu"
  >
    <template #header>
      <span class="header-code">{{ projectCode }}</span>
    </template>

    <template #bar="{ item }">
      <ProcessBar
        :anchor="anchor!"
        :mode="mode"
        :unit="unit"
        :startDate="item.start_date"
        :endDate="item.end_date"
        :title="item.title"
        :projectCode="projectCode"
        :groupStartDate="groupStartDate"
        :groupEndDate="groupEndDate"
        @change="(d) => onBarChange(item.id, d)"
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
