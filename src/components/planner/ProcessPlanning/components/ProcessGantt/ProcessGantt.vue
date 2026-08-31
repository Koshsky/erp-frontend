<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import ProcessBar from '../ProcessBar/ProcessBar.vue'
import type { ProcessGanttProps } from './types'
import { toDate } from '../../../calendar'

const props = withDefaults(defineProps<ProcessGanttProps>(), {
  canManage: true,
  reorderable: false,
})

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; projectId?: number; processId?: number }]
  /** Vertical row drag: the process moved from index `from` to index `to` */
  reorder: [payload: { from: number; to: number }]
  /** Single click on a process bar — switch to that process's tasks tab */
  navigate: [payload: number]
}>()

const groupItems = computed(() => props.processes)

/** Min merged-label height: code (19px) + dates (11px) + padding ≈ 43px */
const MIN_LABEL_HEIGHT = 46

function fmtDate(d: string | Date | number | null | undefined): string {
  return d ? toDate(d).toLocaleDateString('ru') : ''
}

function onBarChange(id: number, d: { start_date: string; end_date: string }) {
  emit('change', { id, ...d })
}

function onBarContextMenu(p: { clientX: number; clientY: number }, id: number) {
  emit('contextmenu', { ...p, date: '', rowIndex: -1, projectId: props.projectId, processId: id })
}
</script>

<template>
  <GroupGantt
    :timeline="timeline"
    :items="groupItems"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
    :groupId="projectId"
    :minLabelHeight="MIN_LABEL_HEIGHT"
    :minRows="3"
    :reorderable="reorderable"
    mergedLabel
    @reorder="(p) => emit('reorder', p)"
  >
    <template #label>
      <div v-if="projectCode" class="pg-code">{{ projectCode }}</div>
      <div v-if="groupStartDate && groupEndDate" class="pg-dates">
        {{ fmtDate(groupStartDate) }} — {{ fmtDate(groupEndDate) }}
      </div>
    </template>

    <template #bar="{ item, startReorder }">
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
        :start-row-reorder="reorderable ? startReorder : null"
        @change="(d) => onBarChange(item.id, d)"
        @contextmenu="(p) => onBarContextMenu(p, item.id)"
        @click="() => emit('navigate', item.id)"
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
@import "../../../../../styles/tokens.css";
.pg-code {
  font-size: 16px;
  font-weight: 800;
  line-height: 1.2;
  color: var(--ui-accent);
  letter-spacing: 0.3px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pg-dates {
  font-size: 10px;
  font-weight: 400;
  color: var(--ui-text-muted);
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
