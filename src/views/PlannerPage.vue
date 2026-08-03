<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import TaskPlanning from '../components/planner/TaskPlanning/TaskPlanning.vue'
import { usePlanningStore, useAppStore } from '../store'
import type { PlanningMode, PlanningUnit } from '../components/planner/calendar'

const planning = usePlanningStore()
const app = useAppStore()

const { taskPlanning, loading, error } = storeToRefs(planning)
const { resources } = storeToRefs(app)

const mode = ref<PlanningMode>('quarter')
const unit = ref<PlanningUnit>('day')
const anchor = ref<Date | null>(null)

onMounted(async () => {
  await planning.loadTaskPlanning()
  if (!resources.value.length) await app.loadResources()
})
</script>

<template>
  <!-- Диаграмма Задач: данные загружает PlannerPage (view) через store,
       TaskPlanning получает их через props -->
  <TaskPlanning
    :processes="taskPlanning?.processes || null"
    :resources="resources"
    :loading="loading"
    :error="error"
    :anchor="anchor"
    :mode="mode"
    :unit="unit"
  />
</template>
