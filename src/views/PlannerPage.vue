<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import TaskPlanning from '../components/planner/TaskPlanning/TaskPlanning.vue'
import { usePlanningStore, useAppStore } from '../store'

const planning = usePlanningStore()
const app = useAppStore()

const { taskPlanning, loading, error } = storeToRefs(planning)
const { resources } = storeToRefs(app)

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
  />
</template>
