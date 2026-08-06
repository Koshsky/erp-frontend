<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import TaskPlanning from '../components/planner/TaskPlanning/TaskPlanning.vue'
import { ResourceManagerModal } from '../components/planner'
import type { AssignedResource, AddResourcePayload } from '../components/planner/ResourceManagerModal'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { useConfirm } from '../composables/useConfirm'
import { usePlanningStore, useAppStore, useAuthStore } from '../store'
import type { PlanningUnit } from '../components/planner/calendar'
import { addDaysISO } from '../components/planner/calendar'

const planning = usePlanningStore()
const app = useAppStore()
const auth = useAuthStore()

const { taskPlanning, loading, error } = storeToRefs(planning)
const { resources } = storeToRefs(app)

const unit = ref<PlanningUnit>('day')

/** Якорь шкалы: первое число предыдущего месяца от сегодня */
const origin = computed(() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 1)
})

// ПКМ по пустому месту группы: создание задачи или вехи в процессе-родителе.
// Дата под курсором; задача вставляется строкой в позицию ПКМ, веха — точка на шкале.
// ПКМ по бару задачи / флажку вехи: меню редактирования/удаления.
interface MenuState {
  x: number
  y: number
  date: string | null
  rowIndex: number
  processId?: number
  taskId?: number
  milestoneId?: number
}
const menu = ref<MenuState | null>(null)

// Диалог подтверждения удаления (вместо window.confirm — блокируется в iframe/песочнице)
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

// dp (директор проектов) — read-only: может менять только приоритет проектов,
// поэтому задачи, вехи и назначения ресурсов ему недоступны для изменения.
const canManage = computed(() => auth.user?.role !== 'dp')

const menuItems = computed<ContextMenuItem[]>(() => {
  if (!canManage.value) return []
  if (menu.value?.taskId != null)
    return [
      { id: 'edit-task', label: 'Редактировать' },
      { id: 'manage-resources', label: 'Управление ресурсами' },
      { id: 'delete-task', label: 'Удалить задачу' },
    ]
  if (menu.value?.milestoneId != null)
    return [
      { id: 'edit-milestone', label: 'Редактировать' },
      { id: 'delete-milestone', label: 'Удалить веху' },
    ]
  return [
    { id: 'create-task', label: 'Создать задачу' },
    { id: 'create-milestone', label: 'Создать веху' },
  ]
})

// Модалка редактирования задачи (название) или вехи (название + контент)
type EditState =
  | { type: 'task'; id: number; title: string }
  | { type: 'milestone'; id: number; title: string; content: string }
const edit = ref<EditState | null>(null)
const saving = ref(false)
const editError = ref<string | null>(null)

const editFields = computed<ModalField[]>(() => {
  if (!edit.value) return []
  const base: ModalField = {
    key: 'title',
    label: 'Название',
    type: 'text',
    value: edit.value.title,
    required: true,
  }
  if (edit.value.type === 'milestone') {
    return [
      base,
      { key: 'content', label: 'Контент', type: 'textarea', value: edit.value.content },
    ]
  }
  return [base]
})

function onContextMenu(p: { clientX: number; clientY: number; date: string | null; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }) {
  if (!canManage.value) return
  // Пустое место группы: создание требует процесс-родитель и известную дату
  if (p.taskId == null && p.milestoneId == null && (p.processId == null || p.date == null)) return
  menu.value = { x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, processId: p.processId, taskId: p.taskId, milestoneId: p.milestoneId }
}

function openTaskEdit(id: number) {
  const task = planning.taskPlanning?.processes
    ?.flatMap((p: any) => p.tasks ?? [])
    .find((x: any) => x.id === id)
  if (task) {
    edit.value = { type: 'task', id, title: task.title ?? '' }
    editError.value = null
  }
}

function openMilestoneEdit(id: number) {
  const ms = planning.taskPlanning?.processes
    ?.flatMap((p: any) => p.milestones ?? [])
    .find((x: any) => x.id === id)
  if (ms) {
    edit.value = { type: 'milestone', id, title: ms.title ?? '', content: ms.content ?? '' }
    editError.value = null
  }
}

async function onSelect(id: string) {
  if (!menu.value) return
  const { date, rowIndex, processId, taskId, milestoneId } = menu.value
  if (id === 'create-task') {
    if (processId == null || date == null) return
    const ok = await planning.createTask({
      title: 'Новая задача',
      process_id: processId,
      start_date: date,
      end_date: addDaysISO(date, 7),
    }, rowIndex)
  } else if (id === 'create-milestone') {
    if (processId == null || date == null) return
    await planning.createMilestone({
      title: 'Новая веха',
      content: 'Новая веха',
      process_id: processId,
      date,
    })
  } else if (id === 'edit-task' && taskId != null) {
    openTaskEdit(taskId)
  } else if (id === 'manage-resources' && taskId != null) {
    openResources(taskId)
  } else if (id === 'edit-milestone' && milestoneId != null) {
    openMilestoneEdit(milestoneId)
  } else if (id === 'delete-task' && taskId != null) {
    ask('Удалить задачу?', () => {
      void planning.deleteTask(taskId)
    })
  } else if (id === 'delete-milestone' && milestoneId != null) {
    ask('Удалить веху?', () => {
      void planning.deleteMilestone(milestoneId)
    })
  }
}

async function onEditSave(values: Record<string, string | number>) {
  if (!edit.value) return
  saving.value = true
  editError.value = null
  const title = String(values.title ?? '')
  const ok =
    edit.value.type === 'task'
      ? await planning.updateTaskMeta(edit.value.id, { title })
      : await planning.updateMilestoneMeta(edit.value.id, {
          title,
          content: String(values.content ?? ''),
        })
  saving.value = false
  if (ok) edit.value = null
  else editError.value = planning.error
}

// Модалка «Управление ресурсами» задачи (назначение/снятие ресурсов)
const resourcesModalTaskId = ref<number | null>(null)
const resourcesBusy = ref(false)
const resourcesError = ref<string | null>(null)

/** Название задачи для заголовка модалки */
const resourcesTaskTitle = computed(() => {
  if (resourcesModalTaskId.value == null) return ''
  return (
    planning.taskPlanning?.processes
      ?.flatMap((p: any) => p.tasks ?? [])
      .find((t: any) => t.id === resourcesModalTaskId.value)?.title ?? ''
  )
})

/** Назначенные задаче ресурсы из /planning/tasks (обновляются после тихого reload) */
const assignedResources = computed<AssignedResource[]>(() => {
  if (resourcesModalTaskId.value == null) return []
  const task = planning.taskPlanning?.processes
    ?.flatMap((p: any) => p.tasks ?? [])
    .find((t: any) => t.id === resourcesModalTaskId.value)
  return (task?.resources ?? []).map((r: any) => ({
    assignment_id: r.assignment_id,
    resource_id: r.id ?? 0,
    quantity: r.quantity ?? 0,
    title: r.title,
    code: r.code,
  }))
})

/** Справочник ресурсов для выбора в модалке (только с id) */
const resourceOptions = computed(() =>
  resources.value
    .filter((r) => r.id != null)
    .map((r) => ({ id: r.id as number, title: r.title, code: r.code })),
)

function openResources(taskId: number) {
  resourcesModalTaskId.value = taskId
  resourcesError.value = null
}

async function onAddResource(payload: AddResourcePayload) {
  if (resourcesModalTaskId.value == null) return
  resourcesBusy.value = true
  resourcesError.value = null
  const ok = await planning.assignResource(
    resourcesModalTaskId.value,
    payload.resource_id,
    payload.quantity,
  )
  resourcesBusy.value = false
  if (!ok) resourcesError.value = planning.error
}

async function onRemoveResource(payload: { resource_id: number }) {
  if (resourcesModalTaskId.value == null) return
  resourcesBusy.value = true
  resourcesError.value = null
  const ok = await planning.removeResource(
    resourcesModalTaskId.value,
    payload.resource_id,
  )
  resourcesBusy.value = false
  if (!ok) resourcesError.value = planning.error
}

onMounted(async () => {
  await planning.loadTaskPlanning()
  if (!resources.value.length) await app.loadResources()
})
</script>

<template>
  <section class="pp">
    <!-- Диаграмма Задач: данные загружает PlannerPage (view) через store,
         TaskPlanning получает их через props -->
    <TaskPlanning
      :processes="taskPlanning?.processes || null"
      :resources="resources"
      :loading="loading"
      :error="error"
      :origin="origin"
      :unit="unit"
      :can-manage="canManage"
      @change="(p) => planning.updateTaskDates(p.id, p.start_date, p.end_date)"
      @milestone-change="(p) => planning.updateMilestoneDate(p.id, p.date)"
      @contextmenu="onContextMenu"
      @task-edit="openTaskEdit"
      @milestone-edit="openMilestoneEdit"
    />

    <ContextMenu
      :open="!!menu"
      :x="menu?.x ?? 0"
      :y="menu?.y ?? 0"
      :items="menuItems"
      @select="onSelect"
      @close="menu = null"
    />

    <ConfirmDialog
      :open="!!confirmDialog"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      @confirm="proceed"
      @close="cancel"
    />

    <ModalForm
      :open="!!edit"
      :title="edit?.type === 'task' ? 'Редактировать задачу' : 'Редактировать веху'"
      :fields="editFields"
      :busy="saving"
      :error="editError"
      @save="onEditSave"
      @close="edit = null"
    />

    <ResourceManagerModal
      :open="resourcesModalTaskId != null"
      :task-id="resourcesModalTaskId ?? 0"
      :task-title="resourcesTaskTitle"
      :resources="resourceOptions"
      :assigned="assignedResources"
      :busy="resourcesBusy"
      :error="resourcesError"
      @add="onAddResource"
      @remove="onRemoveResource"
      @close="resourcesModalTaskId = null"
    />
  </section>
</template>

<style scoped>
.pp {
  --planner-max-height: calc(100vh - 112px);
}
</style>
