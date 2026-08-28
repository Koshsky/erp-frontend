<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import TaskPlanning from '../components/planner/TaskPlanning/TaskPlanning.vue'
import { PdfExport } from '../components/planner'
import { ResourceManagerModal, TaskComments } from '../components/planner'
import type { AssignedResource, AddResourcePayload } from '../components/planner/ResourceManagerModal'
import type { SendCommentPayload, DeleteCommentPayload } from '../components/planner/TaskComments'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { isOffline } from '../offline/state'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { usePlanningOrigin } from '../composables/usePlanningOrigin'
import { useUnitMenu } from '../composables/useUnitMenu'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useFindPlanningItem } from '../composables/useFindPlanningItem'
import { usePlanningStore, useAppStore } from '../store'
import { compareByName } from '../utils'
import { addDaysISO, shiftSpanDates, clampDateToBounds } from '../components/planner/calendar'
import { CELL_WIDTH } from '../components/planner/layout'
import type { PdfGanttGroup } from '../components/planner/PdfExport/pdfRenderer'

const planning = usePlanningStore()
const app = useAppStore()
const route = useRoute()

const { taskPlanning, loading, error } = storeToRefs(planning)
const { resources, calendar } = storeToRefs(app)

const { unit, origin } = usePlanningOrigin()

/** Current visible timeline window (the period "as on screen") + zoom — for PDF export */
const viewRange = ref<{ from: string; to: string; cellWidthPx: number; scale: number }>({
  from: '',
  to: '',
  cellWidthPx: CELL_WIDTH,
  scale: 1,
})

/** Absences of resource members (for the UsageCell tooltip) */
const { absenceByResource } = storeToRefs(app)

let absenceTimer: ReturnType<typeof setTimeout> | null = null

/** Load absences for all resources over the visible window (debounced on scroll/zoom) */
function loadAbsenceForRange(from: string, to: string) {
  if (!from || !to) return
  for (const r of resources.value) {
    if (r.id != null) void app.loadResourceAbsence(r.id, from, to)
  }
}

function onVisibleRange(v: { from: string; to: string; cellWidthPx: number; scale: number }) {
  viewRange.value = v
  if (absenceTimer) clearTimeout(absenceTimer)
  absenceTimer = setTimeout(() => loadAbsenceForRange(v.from, v.to), 300)
}

// Right-click menu on the table header: switching the "Day" / "Decade" scale
const { open: openUnitMenu, close: closeUnitMenu, select: selectUnit, bind: unitMenuBind } = useUnitMenu(unit)

/** Timeline anchor when navigating from the processes tab (click on a process bar) */
const focusDate = computed(() => {
  const id = Number(route.query.process)
  if (!id) return null
  const proc = taskPlanning.value?.processes?.find((p: any) => p.id === id)
  return proc?.start_date ?? null
})

/** Vertical scroll to the process row (task block) */
const focusGroupId = computed(() => {
  const id = Number(route.query.process)
  return id ? id : null
})

// vp owns the tasks/milestones/assignments of their processes; rp — view only
// (the task list for them is already filtered by the backend), dp — read-only.
const { canManageTasks, canViewTasks, canViewProjects, role, userId } = useRoleAccess()

const { findTask, findMilestone } = useFindPlanningItem()

// Right-click on an empty group area: create a task or milestone in the parent process.
// The date is under the cursor; a task is inserted as a row at the right-click position, a milestone is a point on the timeline.
// Right-click on a task bar / milestone flag: edit/delete menu.
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

// Delete confirmation dialog (instead of window.confirm — it is blocked in iframes/sandboxes)
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

const menuItems = computed<ContextMenuItem[]>(() => {
  if (!canViewTasks.value) return []
  // Task: "Comments" is available to everyone who can see the task; the rest — to managing roles.
  if (menu.value?.taskId != null) {
    const items: ContextMenuItem[] = [{ id: 'comments', label: 'Комментарии' }]
    if (canManageTasks.value) {
      items.push(
        { id: 'edit-task', label: 'Редактировать' },
        { id: 'manage-resources', label: 'Управление ресурсами' },
        { id: 'delete-task', label: 'Удалить задачу' },
      )
    }
    return items
  }
  if (menu.value?.milestoneId != null) {
    if (!canManageTasks.value) return []
    return [
      { id: 'edit-milestone', label: 'Редактировать' },
      { id: 'delete-milestone', label: 'Удалить веху' },
    ]
  }
  if (!canManageTasks.value) return []
  return [
    { id: 'create-task', label: 'Создать задачу' },
    { id: 'create-milestone', label: 'Создать веху' },
  ]
})

// Edit modal for a task (title, assignee) or a milestone (title + content)
type EditState =
  | { type: 'task'; id: number; title: string; ownerId?: number }
  | { type: 'milestone'; id: number; title: string; content: string }

/** Candidates for task "assignee" — own employees only (direct subordinates) */
const ownerOptions = computed(() =>
  [...app.myStaff]
    .sort(compareByName)
    .map((u) => ({ value: u.id ?? 0, label: u.name ?? '' })),
)

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
    return [
      base,
      // The assignee is chosen from own employees. The owner cannot be removed
      // (set null); if none is selected from the list — the owner_id field is not sent.
      {
        key: 'owner_id',
        label: 'Ответственный',
        type: 'select',
        value: state.ownerId ?? '',
        options: ownerOptions.value,
      },
    ]
  },
  async (state, values) => {
    const title = String(values.title ?? '')
    if (state.type === 'task') {
      // Empty value (no employee selected) — the owner is not changed: the field is not sent.
      const ownerId = values.owner_id === '' ? undefined : Number(values.owner_id)
      const ok = await planning.updateTaskMeta(state.id, { title, owner_id: ownerId })
      return { ok, error: ok ? null : planning.error }
    }
    const ok = await planning.updateMilestoneMeta(state.id, {
      title,
      content: String(values.content ?? ''),
    })
    return { ok, error: ok ? null : planning.error }
  },
  (state) => (state.type === 'task' ? 'Редактировать задачу' : 'Редактировать веху'),
)

function onContextMenu(p: { clientX: number; clientY: number; date: string | null; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }) {
  if (!canViewTasks.value) return
  // Empty group area: creating tasks/milestones — managing roles only.
  if (p.taskId == null && p.milestoneId == null && !canManageTasks.value) return
  // Empty group area: creation requires a parent process and a known date
  if (p.taskId == null && p.milestoneId == null && (p.processId == null || p.date == null)) return
  openMenu({ x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, processId: p.processId, taskId: p.taskId, milestoneId: p.milestoneId })
}

/** Right-click on the table header — the "Day"/"Decade" scale menu (after closing the actions menu) */
function onHeaderCtx(p: { clientX: number; clientY: number }) {
  closeMenu()
  openUnitMenu(p.clientX, p.clientY)
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openTaskEdit(id: number) {
  const task = findTask(id)
  if (task) {
    openEdit({
      type: 'task',
      id,
      title: task.title ?? '',
      ownerId: task.owner_id ?? undefined,
    })
  }
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
    // A task is created within the bounds of the parent process keeping the default length:
    // a click outside the bounds clamps the span to the parent start/end but does not shrink it.
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
  } else if (id === 'comments' && taskId != null) {
    openComments(taskId)
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

// Task "Resource management" modal (assigning/removing resources)
const resourcesModalTaskId = ref<number | null>(null)
const resourcesBusy = ref(false)
const resourcesError = ref<string | null>(null)

/** Task title for the modal header */
const resourcesTaskTitle = computed(() => {
  if (resourcesModalTaskId.value == null) return ''
  return findTask(resourcesModalTaskId.value)?.title ?? ''
})

/** Resources assigned to the task from /planning/tasks (updated after a silent reload) */
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

/**
 * Resource catalog for choosing in the modal (only those with id). For non-admin
 * keep the resources of the task owners (process/project) — the server will
 * reject a foreign resource anyway (403). admin sees all; when owners are unknown
 * (cold cache) the list is not filtered — the server is the final arbiter.
 */
const resourceOptions = computed(() => {
  const opts = resources.value.filter((r) => r.id != null)
  const owners = planning.taskOwnerIds(resourcesModalTaskId.value ?? 0)
  const allowed = role.value === 'admin' || owners.length === 0 ? null : new Set(owners)
  return opts
    .filter((r) => allowed == null || (r.owner_id != null && allowed.has(r.owner_id)))
    .map((r) => ({ id: r.id as number, title: r.title, code: r.code }))
})

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

// Task "Comments" modal: opens by clicking the bar or from the right-click menu
// (available to everyone who can see the task; offline — viewing the cache without sending).
const commentsTaskId = ref<number | null>(null)

/** Task title for the modal header */
const commentsTaskTitle = computed(() => {
  if (commentsTaskId.value == null) return ''
  return findTask(commentsTaskId.value)?.title ?? ''
})

/** Task comments from the store cache (flat list; the tree is built by the component) */
const taskComments = computed(() => {
  if (commentsTaskId.value == null) return []
  return planning.commentsByTask[commentsTaskId.value] ?? []
})

function openComments(taskId: number) {
  commentsTaskId.value = taskId
  void planning.loadTaskComments(taskId)
}

async function onSendComment(payload: SendCommentPayload) {
  if (commentsTaskId.value == null) return
  await planning.createTaskComment(commentsTaskId.value, payload.content, payload.parent_id)
}

function onDeleteComment(payload: DeleteCommentPayload) {
  if (commentsTaskId.value == null) return
  ask('Удалить комментарий? Ответы останутся.', () => {
    void planning.deleteTaskComment(commentsTaskId.value ?? 0, payload.comment_id)
  })
}

onMounted(async () => {
  // Project priorities and resources are needed before tasks: processesByPriority sorts by them,
  // and when the timeline mounts the group order is already final (otherwise the navigation anchor drifts).
  // Projects are fetched by admin/dp/rp only; vp/worker do not have them (403) — sorting by id.
  if (canViewProjects.value && !app.projects.length) await app.loadProjects()
  if (!resources.value.length) await app.loadResources()
  // User catalog — for task assignee names (owner_id → name)
  if (!app.users.length) await app.loadUsers()
  // Own employees — the pool of candidates for task "assignees"
  await app.loadMyStaff()
  // The availability calendar is refreshed on EVERY page entry: the timesheet may
  // have changed, and ResourceHeader must immediately show fresh availability.
  await app.loadCalendar()
  await planning.loadTaskPlanning()
})

/**
 * Processes on the Tasks page are sorted by the priority of their project
 * (priority first, then by id). Priorities come from app.projects.
 */
const processesByPriority = computed(() => {
  const prio = new Map<number, number>()
  for (const p of app.projects) {
    if (p.id != null) prio.set(p.id, p.priority ?? Number.MAX_SAFE_INTEGER)
  }
  let list = taskPlanning.value?.processes ?? []
  // vp: show only processes in projects where vp owns at least one process
  if (role.value === 'vp' && userId.value != null) {
    const myProjects = new Set(
      list.filter((p: any) => p.owner_id === userId.value).map((p: any) => p.project_id),
    )
    list = list.filter((p: any) => myProjects.has(p.project_id))
  }
  return [...list].sort((a, b) => {
    const pa = prio.get(a.project_id ?? -1) ?? Number.MAX_SAFE_INTEGER
    const pb = prio.get(b.project_id ?? -1) ?? Number.MAX_SAFE_INTEGER
    // Same project priority — processes keep their per-project order
    return pa - pb || (a.order ?? a.id ?? 0) - (b.order ?? b.id ?? 0)
  })
})

/** Print model for PdfExport: a process = a group, tasks = rows */
const taskGroups = computed<PdfGanttGroup[]>(() =>
  processesByPriority.value.map((p: any) => ({
    id: p.id,
    code: p.project_code,
    title: p.title ?? '',
    start_date: p.start_date ?? '',
    end_date: p.end_date ?? '',
    project_id: p.project_id,
    owner_id: p.owner_id ?? undefined,
    rows: (p.tasks ?? []).map((t: any) => ({
      id: t.id,
      title: t.title ?? '',
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      resources: (t.resources ?? []).map((r: any) => ({ id: r.id, code: r.code, title: r.title, quantity: r.quantity })),
    })),
    milestones: (p.milestones ?? []).map((m: any) => ({ id: m.id, title: m.title ?? '', date: m.date ?? '' })),
  })),
)
</script>

<template>
  <section class="pp">
    <!-- Printing the diagram as PDF: the period and cell width come from the current page view -->
    <div class="pp-toolbar">
      <PdfExport
        :groups="taskGroups"
        :resources="resources"
        :calendar="calendar"
        :origin="origin"
        :unit="unit"
        :owner-id="userId"

        scope="tasks"
        :period-from="viewRange.from"
        :period-to="viewRange.to"
        :scale="viewRange.scale"
        page-title="Диаграмма задач"
      />
    </div>

    <!-- Tasks Diagram: PlannerPage (view) loads the data via the store,
         TaskPlanning receives it through props -->
    <TaskPlanning
      :processes="processesByPriority"
      :resources="resources"
      :calendar="calendar"
      :absence-by-resource="absenceByResource"
      :users="app.users"
      :loading="loading"
      :error="error"
      :origin="origin"
      :unit="unit"
      :can-manage="canManageTasks"
      :reorderable="canManageTasks"
      :focus-date="focusDate"
      :focus-group-id="focusGroupId"
      :comments-by-task="planning.commentsByTask"
      @change="(p) => planning.updateTaskDates(p.id, p.start_date, p.end_date)"
      @milestone-change="(p) => planning.updateMilestoneDate(p.id, p.date)"
      @contextmenu="onContextMenu"
      @header-ctxmenu="onHeaderCtx"
      @reorder="(p) => void planning.reorderTasks(p.processId, p.from, p.to)"
      @milestone-edit="openMilestoneEdit"
      @visible-range="onVisibleRange"
      @open-comments="openComments"
      @request-comments="(id) => planning.loadTaskComments(id, { fresh: false })"
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

    <TaskComments
      :open="commentsTaskId != null"
      :task-id="commentsTaskId ?? 0"
      :task-title="commentsTaskTitle"
      :comments="taskComments"
      :users="app.users"
      :busy="planning.commentsLoading"
      :error="planning.commentsError"
      :disabled-reason="isOffline ? 'Недоступно в офлайне' : null"
      :can-manage="canManageTasks"
      :user-id="userId"
      @send="onSendComment"
      @delete="onDeleteComment"
      @close="commentsTaskId = null"
    />
  </section>
</template>

<style scoped>
.pp {
  --planner-max-height: calc(100vh - 112px);
}
.pp-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
</style>
