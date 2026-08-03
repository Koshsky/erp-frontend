<script setup lang="ts">
import { computed } from 'vue'
import { GroupGantt } from '../../../GroupGantt'
import ProcessBar from '../ProcessBar/ProcessBar.vue'
import type { ProcessGanttProps } from './types'

const props = defineProps<ProcessGanttProps>()

const groupItems = computed(() => props.processes)
</script>

<template>
  <GroupGantt
    :anchor="anchor"
    :mode="mode"
    :unit="unit"
    :items="groupItems"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
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
      />
    </template>
  </GroupGantt>
</template>

<style scoped>
</style>
