<script setup lang="ts">
import { computed } from 'vue'
import GanttBar from '../../../GanttBar/GanttBar.vue'
import type { ProcessBarProps } from './types'
import { toDate } from '../../../calendar'

const props = withDefaults(defineProps<ProcessBarProps>(), {
  projectCode: '',
  ownerName: '',
  color: '#1a73e8',
  opacity: 0.85,
  draggable: true,
  groupStartDate: null,
  groupEndDate: null,
})

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  edit: []
}>()

const dateRange = computed(() =>
  `${toDate(props.startDate).toLocaleDateString('ru')} — ${toDate(props.endDate).toLocaleDateString('ru')}`,
)
</script>

<template>
  <GanttBar
    :timeline="timeline"
    :startDate="startDate"
    :endDate="endDate"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
    :color="color"
    :opacity="opacity"
    :title="title"
    :height="24"
    :top="1"
    :minWidth="40"
    padding="0 10px"
    :shadow="true"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @edit="() => emit('edit')"
  >
    <span class="pb-title">{{ title }}</span>
    <span v-if="projectCode" class="pb-code">{{ projectCode }}</span>
    <template #tooltip>
      <slot name="tooltip">
        <div class="gb-tooltip">
          <div class="gb-tooltip-title">{{ title }}</div>
          <div v-if="ownerName" class="gb-tooltip-row">Владелец: {{ ownerName }}</div>
          <div class="gb-tooltip-row">{{ dateRange }}</div>
        </div>
      </slot>
    </template>
  </GanttBar>
</template>

<style scoped>
.pb-title {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  pointer-events: none;
}
.pb-code {
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
  padding: 0 5px;
  margin-left: 6px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
