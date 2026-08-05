<script setup lang="ts">
import { computed } from 'vue'
import ProcessBar from '../../../ProcessPlanning/components/ProcessBar/ProcessBar.vue'
import type { ProjectBarProps } from './types'
import { toDate } from '../../../calendar'

const props = withDefaults(defineProps<ProjectBarProps>(), {
  color: '#1a73e8',
  opacity: 0.85,
  draggable: true,
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
  <ProcessBar
    :timeline="timeline"
    :startDate="startDate"
    :endDate="endDate"
    :title="projectCode"
    :color="color"
    :opacity="opacity"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @edit="() => emit('edit')"
  >
    <template #tooltip>
      <div class="gb-tooltip">
        <div class="gb-tooltip-title">{{ projectCode }}</div>
        <div v-if="priority != null" class="gb-tooltip-row">Приоритет: {{ priority }}</div>
        <div v-if="ownerName" class="gb-tooltip-row">Владелец: {{ ownerName }}</div>
        <div class="gb-tooltip-row">{{ dateRange }}</div>
      </div>
    </template>
  </ProcessBar>
</template>
