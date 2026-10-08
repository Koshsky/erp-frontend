<script setup lang="ts">
import { computed } from 'vue'
import LabeledBar from '../../../Bar/Bar.vue'
import { BarTooltip } from '@/components/common'
import { t } from '@/i18n'
import { viewSettings } from '@/settings'
import type { ProjectBarProps } from './types'

const props = withDefaults(defineProps<ProjectBarProps>(), {
  color: 'var(--ui-gantt-project)',
  opacity: 0.85,
  draggable: true,
})

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  click: []
}>()

/** Tooltip rows, rebuilt on a language switch */
const priorityRow = computed(() => t('planner.bar.priority', { value: props.priority }))
const ownerRow = computed(() => t('planner.bar.owner', { owner: props.ownerName }))
</script>

<template>
  <LabeledBar
    :timeline="timeline"
    :startDate="startDate"
    :endDate="endDate"
    :title="projectCode"
    :color="color || 'var(--ui-gantt-project)'"
    :opacity="opacity"
    :height="40"
    :top="6"
    :draggable="draggable"
    :start-row-reorder="startRowReorder"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @click="() => emit('click')"
  >
    <template #tooltip="{ dateRange }">
      <BarTooltip
        :title="projectCode"
        :accent="color || 'var(--ui-gantt-project)'"
        :rows="[
          props.priority != null ? priorityRow : '',
          viewSettings.badgeOwner && props.ownerName ? ownerRow : '',
          dateRange,
        ].filter(Boolean)"
      />
    </template>
  </LabeledBar>
</template>

<style scoped>
@import '../../../../../styles/tokens.css';
</style>
