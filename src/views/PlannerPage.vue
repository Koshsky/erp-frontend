<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import TaskPlanning from '../components/planner/TaskPlanning/TaskPlanning.vue'
import { ResourceManagerModal } from '../components/planner'
import type { AssignedResource, AddResourcePayload } from '../components/planner/ResourceManagerModal'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { usePlanningOrigin } from '../composables/usePlanningOrigin'
import { useUnitMenu } from '../composables/useUnitMenu'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useFindPlanningItem } from '../composables/useFindPlanningItem'
import { usePlanningStore, useAppStore } from '../store'
import { addDaysISO, shiftSpanDates, clampDateToBounds } from '../components/planner/calendar'

const planning = usePlanningStore()
const app = useAppStore()
const route = useRoute()

const { taskPlanning, loading, error } = storeToRefs(planning)
const { resources } = storeToRefs(app)

const { unit, origin } = usePlanningOrigin()

// Меню ПКМ по шапке таблицы: переключение масштаба «День» / «Декада»
const { open: openUnitMenu, close: closeUnitMenu, select: selectUnit, bind: unitMenuBind } = useUnitMenu(unit)

/** Якорь шкалы при навигации с вкладки процессов (клик по бару процесса) */
const focusDate = computed(() => {
  const id = Number(route.query.process)
  if (!id) return null
  const proc = taskPlanning.value?.processes?.find((p: any) => p.id === id)
  return proc?.start_date ?? null
})

/** Прокрутка по вертикали к строке (блоку задач) процесса */
const focusGroupId = computed(() => {
  const id = Number(route.query.process)
  return id ? id : null
})

// dp (директор проектов) — read-only: может менять только приоритет проектов,
// поэтому задачи, вехи и назначения ресурсов ему недоступны для изменения.
const { canManage } = useRoleAccess()

const { findTask, findMilestone } = useFindPlanningItem()

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
const { open: openEdit, close: closeEdit, submit: submitEdit, bind: editBind } = useEditModal<EditState>(
  (state) => {
    const base: ModalField = {
      key: 'title',
      label: 'Название',
      type: 'text',
      value: state.title,
      required: true,
    }
    if (state.type === 'milestone') {
      return [
        base,
        { key: 'content', label: 'Контент', type: 'textarea', value: state.content },
      ]
    }
    return [base]
  },
  async (state, values) => {
    const title = String(values.title ?? '')
    const ok =
      state.type === 'task'
        ? await planning.updateTaskMeta(state.id, { title })
        : await planning.updateMilestoneMeta(state.id, {
            title,
            content: String(values.content ?? ''),
          })
    return { ok, error: ok ? null : planning.error }
  },
  (state) => (state.type === 'task' ? 'Редактировать задачу' : 'Редактировать веху'),
)

function onContextMenu(p: { clientX: number; clientY: number; date: string | null; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }) {
  if (!canManage.value) return
  // Пустое место группы: создание требует процесс-родитель и известную дату
  if (p.taskId == null && p.milestoneId == null && (p.processId == null || p.date == null)) return
  openMenu({ x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, processId: p.processId, taskId: p.taskId, milestoneId: p.milestoneId })
}

/** ПКМ по шапке таблицы — меню масштаба «День»/«Декада» (закрыв меню действий) */
function onHeaderCtx(p: { clientX: number; clientY: number }) {
  closeMenu()
  openUnitMenu(p.clientX, p.clientY)
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openTaskEdit(id: number) {
  const task = findTask(id)
  if (task) openEdit({ type: 'task', id, title: task.title ?? '' })
}

function openMilestoneEdit(id: number) {
  const ms = findMilestone(id)
  if (ms) {
    openEdit({ type: 'milestone', id, title: ms.title ?? '', content: ms.content ?? '' })
  }
}

async function handleSelect(id: string) {
  if (!menu.value) return
  const { date, rowIndex, processId, taskId, milestoneId } = menu.value
  if (id === 'create-task') {
    if (processId == null || date == null) return
    const proc = planning.taskPlanning?.processes?.find((p: any) => p.id === processId)
    // Задача создаётся в пределах процесса-родителя с сохранением дефолтной длины:
    // клик вне границ прижимает спана к началу/концу родителя, но не ужимает его.
    const { start_date, end_date } = shiftSpanDates(
      date,
      addDaysISO(date, 7),
      proc?.start_date,
      proc?.end_date,
    )
    const ok = await planning.createTask({
      title: 'Новая задача',
      process_id: processId,
      start_date,
      end_date,
    }, rowIndex)
  } else if (id === 'create-milestone') {
    if (processId == null || date == null) return
    const proc = planning.taskPlanning?.processes?.find((p: any) => p.id === processId)
    await planning.createMilestone({
      title: 'Новая веха',
      content: 'Новая веха',
      process_id: processId,
      date: clampDateToBounds(date, proc?.start_date, proc?.end_date),
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

// Модалка «Управление ресурсами» задачи (назначение/снятие ресурсов)
const resourcesModalTaskId = ref<number | null>(null)
const resourcesBusy = ref(false)
const resourcesError = ref<string | null>(null)

/** Название задачи для заголовка модалки */
const resourcesTaskTitle = computed(() => {
  if (resourcesModalTaskId.value == null) return ''
  return findTask(resourcesModalTaskId.value)?.title ?? ''
})

/** Назначенные задаче ресурсы из /planning/tasks (обновляются после тихого reload) */
const assignedResources = computed<AssignedResource[]>(() => {
  if (resourcesModalTaskId.value == null) return []
  const task = findTask(resourcesModalTaskId.value)
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
  // Приоритеты проектов и ресурсы нужны до задач: processesByPriority сортируется по ним,
  // и при монтировании шкалы порядок групп уже финальный (иначе якорь навигации уезжает).
  if (!app.projects.length) await app.loadProjects()
  if (!resources.value.length) await app.loadResources()
  await planning.loadTaskPlanning()
})

/**
 * Процессы на странице Задач отсортированы по приоритету проекта, к которому они
 * относятся (сначала приоритет, внутри — по id). Приоритеты берём из app.projects.
 */
const processesByPriority = computed(() => {
  const prio = new Map<number, number>()
  for (const p of app.projects) {
    if (p.id != null) prio.set(p.id, p.priority ?? Number.MAX_SAFE_INTEGER)
  }
  return [...(taskPlanning.value?.processes ?? [])].sort((a, b) => {
    const pa = prio.get(a.project_id ?? -1) ?? Number.MAX_SAFE_INTEGER
    const pb = prio.get(b.project_id ?? -1) ?? Number.MAX_SAFE_INTEGER
    return pa - pb || (a.id ?? 0) - (b.id ?? 0)
  })
})
</script>

<template>
  <section class="pp">
    <!-- Диаграмма Задач: данные загружает PlannerPage (view) через store,
         TaskPlanning получает их через props -->
    <TaskPlanning
      :processes="processesByPriority"
      :resources="resources"
      :loading="loading"
      :error="error"
      :origin="origin"
      :unit="unit"
      :can-manage="canManage"
      :focus-date="focusDate"
      :focus-group-id="focusGroupId"
      @change="(p) => planning.updateTaskDates(p.id, p.start_date, p.end_date)"
      @milestone-change="(p) => planning.updateMilestoneDate(p.id, p.date)"
      @contextmenu="onContextMenu"
      @header-ctxmenu="onHeaderCtx"
      @milestone-edit="openMilestoneEdit"
    />

    <ContextMenu v-bind="menuBind" @select="select" @close="closeMenu" />

    <ContextMenu v-bind="unitMenuBind" @select="selectUnit" @close="closeUnitMenu" />

    <ConfirmDialog
      :open="!!confirmDialog"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      @confirm="proceed"
      @close="cancel"
    />

    <ModalForm v-bind="editBind" @save="submitEdit" @close="closeEdit" />

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
