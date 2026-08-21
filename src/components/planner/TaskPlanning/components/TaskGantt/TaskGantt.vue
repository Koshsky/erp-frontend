<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import { MilestoneMarker } from '../../../MilestoneMarker'
import TaskBar from './components/TaskBar/TaskBar.vue'
import type { TaskGanttProps } from './types'
import { LABEL_WIDTH } from '../../../layout'
import { toDate } from '../../../calendar'

const props = withDefaults(defineProps<TaskGanttProps>(), {
  canManage: true,
})

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  'milestone-change': [payload: { id: number; date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }]
  'milestone-edit': [payload: number]
}>()

const groupItems = computed(() => props.tasks)

/** Мин. высота объединённого лейбла: код (19px) + имя (14px) + даты (11px) + отступы ≈ 60px */
const MS_MIN_LABEL_HEIGHT = 64

function fmtDate(d: string | Date | number | null | undefined): string {
  return d ? toDate(d).toLocaleDateString('ru') : ''
}

function onBarChange(id: number, d: { start_date: string; end_date: string }) {
  emit('change', { id, ...d })
}

function onBarContextMenu(p: { clientX: number; clientY: number }, id: number) {
  emit('contextmenu', { ...p, date: '', rowIndex: -1, processId: props.processId, taskId: id })
}

function onMilestoneContextMenu(p: { clientX: number; clientY: number }, id: number) {
  emit('contextmenu', { ...p, date: '', rowIndex: -1, processId: props.processId, milestoneId: id })
}

function onMilestoneEdit(id: number) {
  if (props.canManage) emit('milestone-edit', id)
}
</script>

<template>
  <div class="tg-task-group">
    <!-- Непрозрачная липкая ячейка колонки названий для строки вех (иначе сквозь неё видны бары) -->
    <div class="tg-ms-label" :style="{ width: LABEL_WIDTH + 'px' }" />
    <GroupGantt
      :timeline="timeline"
      :items="groupItems"
      :groupStartDate="groupStartDate"
      :groupEndDate="groupEndDate"
      :groupId="processId"
      :minLabelHeight="MS_MIN_LABEL_HEIGHT"
      :minRows="3"
      mergedLabel
    >
      <template #label>
        <div v-if="projectCode" class="gl-code">{{ projectCode }}</div>
        <div class="gl-title">{{ title }}</div>
        <div v-if="groupStartDate && groupEndDate" class="gl-dates">
          {{ fmtDate(groupStartDate) }} — {{ fmtDate(groupEndDate) }}
        </div>
      </template>

      <template #bar="{ item }">
        <TaskBar
          :timeline="timeline"
          :task="item"
          :projectCode="projectCode"
          :groupStartDate="groupStartDate"
          :groupEndDate="groupEndDate"
          :draggable="canManage"
          @change="(d) => onBarChange(item.id, d)"
          @contextmenu="(p) => onBarContextMenu(p, item.id)"
        />
      </template>
    </GroupGantt>

    <MilestoneMarker
      v-for="ms in milestones"
      :key="ms.id"
      :timeline="timeline"
      :date="ms.date"
      :title="ms.title"
      :content="ms.content"
      :color="ms.color"
      :stripHeight="20"
      :groupStartDate="groupStartDate"
      :groupEndDate="groupEndDate"
      :draggable="canManage"
      @change="(d) => emit('milestone-change', { id: ms.id, ...d })"
      @contextmenu="(p) => onMilestoneContextMenu(p, ms.id)"
      @edit="() => onMilestoneEdit(ms.id)"
    />
  </div>
</template>

<style scoped>
.tg-task-group {
  position: relative;
  box-sizing: border-box;
  padding-top: 20px;
}
.tg-ms-label {
  position: sticky;
  left: 0;
  height: 20px;
  background: #fff;
  /* Боковая панель — выше линии текущей даты (25) */
  z-index: 65;
  margin-top: -20px;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
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
.gl-dates {
  font-size: 10px;
  font-weight: 400;
  color: #888;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
