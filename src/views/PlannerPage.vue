<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import TaskPlanning from '../components/planner/TaskPlanning/TaskPlanning.vue'
import { ContextMenu } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import { usePlanningStore, useAppStore } from '../store'
import type { PlanningMode, PlanningUnit } from '../components/planner/calendar'
import { addDaysISO } from '../components/planner/calendar'

const planning = usePlanningStore()
const app = useAppStore()

const { taskPlanning, loading, error } = storeToRefs(planning)
const { resources } = storeToRefs(app)

const mode = ref<PlanningMode>('quarter')
const unit = ref<PlanningUnit>('day')
const anchor = ref<Date | null>(null)

// ПКМ по пустому месту группы: создание задачи или вехи в процессе-родителе.
// Дата под курсором; задача вставляется строкой в позицию ПКМ, веха — точка на шкале.
// ПКМ по бару задачи / флажку вехи: меню удаления.
interface MenuState {
  x: number
  y: number
  date: string
  rowIndex: number
  processId?: number
  taskId?: number
  milestoneId?: number
}
const menu = ref<MenuState | null>(null)
const menuItems = computed<ContextMenuItem[]>(() => {
  if (menu.value?.taskId != null) return [{ id: 'delete-task', label: 'Удалить задачу' }]
  if (menu.value?.milestoneId != null) return [{ id: 'delete-milestone', label: 'Удалить веху' }]
  return [
    { id: 'create-task', label: 'Создать задачу' },
    { id: 'create-milestone', label: 'Создать веху' },
  ]
})

function onContextMenu(p: { clientX: number; clientY: number; date: string; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }) {
  menu.value = { x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, processId: p.processId, taskId: p.taskId, milestoneId: p.milestoneId }
}

async function onSelect(id: string) {
  if (!menu.value) return
  const { date, rowIndex, processId, taskId, milestoneId } = menu.value
  if (id === 'create-task') {
    if (processId == null) return
    const ok = await planning.createTask({
      title: 'Новая задача',
      process_id: processId,
      start_date: date,
      end_date: addDaysISO(date, 7),
    }, rowIndex)
    if (!ok) error.value = planning.error
  } else if (id === 'create-milestone') {
    if (processId == null) return
    const ok = await planning.createMilestone({
      title: 'Новая веха',
      content: 'Новая веха',
      process_id: processId,
      date,
    })
    if (!ok) error.value = planning.error
  } else if (id === 'delete-task' && taskId != null) {
    if (!window.confirm('Удалить задачу?')) return
    const ok = await planning.deleteTask(taskId)
    if (!ok) error.value = planning.error
  } else if (id === 'delete-milestone' && milestoneId != null) {
    if (!window.confirm('Удалить веху?')) return
    const ok = await planning.deleteMilestone(milestoneId)
    if (!ok) error.value = planning.error
  }
}

onMounted(async () => {
  await planning.loadTaskPlanning()
  if (!resources.value.length) await app.loadResources()
})
</script>

<template>
  <section class="pp">
    <h2 class="pp-title">Задачи</h2>
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
      @change="(p) => planning.updateTaskDates(p.id, p.start_date, p.end_date)"
      @milestone-change="(p) => planning.updateMilestoneDate(p.id, p.date)"
      @contextmenu="onContextMenu"
    />

    <ContextMenu
      :open="!!menu"
      :x="menu?.x ?? 0"
      :y="menu?.y ?? 0"
      :items="menuItems"
      @select="onSelect"
      @close="menu = null"
    />
  </section>
</template>

<style scoped>
.pp-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 20px;
}
</style>
