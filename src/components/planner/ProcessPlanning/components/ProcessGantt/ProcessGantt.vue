<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import ProcessBar from '../ProcessBar/ProcessBar.vue'
import type { ProcessGanttProps } from './types'

const props = withDefaults(defineProps<ProcessGanttProps>(), {
  canManage: true,
})

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; projectId?: number; processId?: number }]
  edit: [payload: number]
}>()

const groupItems = computed(() => props.processes)

function onBarChange(id: number, d: { start_date: string; end_date: string }) {
  emit('change', { id, ...d })
}

function onBarContextMenu(p: { clientX: number; clientY: number }, id: number) {
  emit('contextmenu', { ...p, date: '', rowIndex: -1, projectId: props.projectId, processId: id })
}

function onBarEdit(id: number) {
  if (props.canManage) emit('edit', id)
}
</script>

<template>
  <GroupGantt
    :timeline="timeline"
    :items="groupItems"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
    :groupId="projectId"
  >
    <template #bar="{ item }">
      <ProcessBar
        :timeline="timeline"
        :startDate="item.start_date"
        :endDate="item.end_date"
        :title="item.title"
        :projectCode="projectCode"
        :ownerName="item.owner_name"
        :groupStartDate="groupStartDate"
        :groupEndDate="groupEndDate"
        :draggable="canManage"
        @change="(d) => onBarChange(item.id, d)"
        @contextmenu="(p) => onBarContextMenu(p, item.id)"
        @edit="() => onBarEdit(item.id)"
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
