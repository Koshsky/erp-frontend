<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import TaskPlanning from '../components/planner/TaskPlanning/TaskPlanning.vue'
import { HintButton } from '../components/common'
import { PdfExport } from '../components/planner'
import { ResourceManagerModal, TaskComments, TaskEditor } from '../components/planner'
import type { AssignedResource, AddResourcePayload } from '../components/planner/ResourceManagerModal'
import type { SendCommentPayload, DeleteCommentPayload } from '../components/planner/TaskComments'
import type {
  NewSubtaskPayload,
  UpdateSubtaskPayload,
  TaskEditorTask,
  TaskEditorPatch,
} from '../components/planner/TaskEditor'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { isOffline } from '../offline/state'
import { scheduleNamedRefresh } from '../offline/sync'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { usePlanningOrigin } from '../composables/usePlanningOrigin'
import { useUnitMenu } from '../composables/useUnitMenu'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useFindPlanningItem } from '../composables/useFindPlanningItem'
import { usePlanningStore, useAppStore, useRbacStore } from '../store'
import { compareByName } from '../utils'
import { t } from '../i18n'
import { addDaysISO, shiftSpanDates, clampDateToBounds } from '../components/planner/calendar'
import type { DependencyType } from '../components/planner/dependencies'
import { CELL_WIDTH } from '../components/planner/layout'
import { randomPaletteColor } from '../components/common/ColorField/palette'
import type { PdfGanttGroup } from '../components/planner/PdfExport/pdfRenderer'
import type { DtoDetailedProcess, DtoDetailedTask, DtoTaskDependency, DtoResource, DtoMilestone } from '@/api'

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
  const proc = taskPlanning.value?.processes?.find((p: DtoDetailedProcess) => p.id === id)
  return proc?.start_date ?? null
})

/** Vertical scroll to the process row (task block) */
const focusGroupId = computed(() => {
  const id = Number(route.query.process)
  return id ? id : null
})

// vp owns the tasks/milestones/assignments of their processes; rp — view only
// (the task list for them is already filtered by the backend), dp — read-only.
const {
  canCreateTask,
  canManageTask,
  canDeleteTask,
  canAssignTaskResources,
  canCreateMilestone,
  canManageMilestone,
  canDeleteMilestone,
  canViewTasks,
  canDeleteOthersComments,
  canViewProjects,
  role,
  userId,
} = useRoleAccess()

const rbac = useRbacStore()
/** Permissions arrived (or were cached) — the matrix is authoritative; presets are only the cold-start fallback. */
const permsReady = computed(() => rbac.permsLoaded || rbac.myPermissions.length > 0)
/** Unrestricted resource visibility (resource.view scope all) — e.g. admin sees every resource. */
const seesAllResources = computed(() =>
  permsReady.value ? rbac.perm('resource', 'view') === 'all' : role.value === 'admin',
)

/** Drag/resize/reorder/assign are enabled when the user can manage at least one visible process */
const anyManageableTask = computed(() =>
  (taskPlanning.value?.processes ?? []).some((p: DtoDetailedProcess) => canManageTask(p.id)),
)

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
  // Task: "Comments" is available to everyone who can see the task; the rest
  // follow the exact backend rights for the task's process.
  if (menu.value?.taskId != null) {
    const processId = findTask(menu.value.taskId)?.process_id
    const items: ContextMenuItem[] = [{ id: 'comments', label: t('plannerViews.planner.menu.comments') }]
    if (canManageTask(processId)) items.push({ id: 'edit-task', label: t('plannerViews.planner.menu.editTask') })
    if (canAssignTaskResources(processId)) {
      items.push({ id: 'manage-resources', label: t('plannerViews.planner.menu.manageResources') })
    }
    if (canDeleteTask(processId)) items.push({ id: 'delete-task', label: t('plannerViews.planner.menu.deleteTask') })
    return items
  }
  if (menu.value?.milestoneId != null) {
    const processId = findMilestone(menu.value.milestoneId)?.process_id
    const items: ContextMenuItem[] = []
    if (canManageMilestone(processId)) items.push({ id: 'edit-milestone', label: t('plannerViews.planner.menu.editMilestone') })
    if (canDeleteMilestone(processId)) items.push({ id: 'delete-milestone', label: t('plannerViews.planner.menu.deleteMilestone') })
    return items
  }
  const items: ContextMenuItem[] = []
  if (canCreateTask(menu.value?.processId)) items.push({ id: 'create-task', label: t('plannerViews.planner.menu.createTask') })
  if (canCreateMilestone(menu.value?.processId)) {
    items.push({ id: 'create-milestone', label: t('plannerViews.planner.menu.createMilestone') })
  }
  return items
})

// Edit modal for a milestone (title + content, color); tasks use TaskEditor.
type EditState =
  | { type: 'milestone'; id: number; title: string; content: string; color?: string }

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
      label: t('plannerViews.planner.milestone.field.title'),
      type: 'text',
      value: state.title,
      required: true,
    }
    const colorField: ModalField = { key: 'color', label: t('plannerViews.planner.milestone.field.color'), type: 'color', value: state.color ?? '' }
    return [
      base,
      colorField,
      { key: 'content', label: t('plannerViews.planner.milestone.field.content'), type: 'textarea', value: state.content },
    ]
  },
  async (state, values) => {
    const ok = await planning.updateMilestoneMeta(state.id, {
      title: String(values.title ?? ''),
      color: String(values.color ?? ''),
      content: String(values.content ?? ''),
    })
    return { ok, error: ok ? null : planning.error }
  },
  () => t('plannerViews.planner.milestone.title'),
)

// === Task editor modal (left: task fields; right: subtasks todo list) ===
const taskEditorId = ref<number | null>(null)
const taskEditorBusy = ref(false)
const taskEditorError = ref<string | null>(null)

/** The task being edited (with process_id for the permission check) */
const taskEditorTask = computed<TaskEditorTask | null>(() => {
  if (taskEditorId.value == null) return null
  const t = findTask(taskEditorId.value)
  if (!t) return null
  return {
    id: t.id ?? 0,
    title: t.title ?? '',
    color: t.color ?? '',
    status: t.status ?? 'not_started',
    owner_id: t.owner_id ?? null,
    process_id: t.process_id ?? 0,
  }
})

/** Subtask rows for the right panel (from the planning cache) */
const taskEditorSubtasks = computed(() => {
  if (taskEditorId.value == null) return []
  return (findTask(taskEditorId.value)?.subtasks ?? []).map((s: DtoDetailedTask) => ({
    id: s.id ?? 0,
    title: s.title ?? '',
    color: s.color ?? '',
    status: s.status ?? 'not_started',
  }))
})

function openTaskEdit(id: number) {
  const task = findTask(id)
  if (!task) return
  taskEditorId.value = id
  taskEditorError.value = null
  taskEditorBusy.value = false
}

function closeTaskEdit() {
  taskEditorId.value = null
  taskEditorError.value = null
}

async function onSaveTaskEditor(patch: TaskEditorPatch) {
  if (taskEditorId.value == null) return
  taskEditorBusy.value = true
  taskEditorError.value = null
  // Mutation failures are reported by the global toast (http.ts) — no inline banner.
  await planning.updateTaskMeta(taskEditorId.value, patch)
  taskEditorBusy.value = false
}

async function onAddSubtask(payload: NewSubtaskPayload) {
  if (taskEditorId.value == null) return
  taskEditorBusy.value = true
  taskEditorError.value = null
  // Mutation failures are reported by the global toast (http.ts) — no inline banner.
  await planning.createSubtask(taskEditorId.value, payload)
  taskEditorBusy.value = false
}

async function onUpdateSubtask(payload: UpdateSubtaskPayload) {
  taskEditorBusy.value = true
  taskEditorError.value = null
  // Mutation failures are reported by the global toast (http.ts) — no inline banner.
  await planning.updateSubtask(payload.id, payload.patch)
  taskEditorBusy.value = false
}

async function onDeleteSubtask(id: number) {
  if (taskEditorId.value == null) return
  // Mutation failures are reported by the global toast (http.ts) — no inline banner.
  await planning.deleteSubtask(id)
}

// === Task dependencies (scheduling links) ===

/** Predecessor links of the edited task (with the predecessor title resolved
 *  from the planning cache), for the "Dependencies" panel. */
const taskEditorDependencies = computed(() => {
  if (taskEditorId.value == null) return []
  const proc = taskPlanning.value?.processes?.find(
    (p: DtoDetailedProcess) => p.id === findTask(taskEditorId.value!)?.process_id,
  )
  return ((proc?.dependencies ?? []) as DtoTaskDependency[])
    .filter((e: DtoTaskDependency) => e.task_id === taskEditorId.value)
    .map((e: DtoTaskDependency) => ({
      id: e.id ?? 0,
      task_id: e.task_id ?? 0,
      depends_on_task_id: e.depends_on_task_id ?? 0,
      type: e.type as DependencyType,
      title: findTask(e.depends_on_task_id ?? 0)?.title ?? `#${e.depends_on_task_id}`,
    }))
})

/** Candidate predecessors for the add form: top-level tasks of the same
 *  process, excluding the task itself and its current predecessors. */
const taskEditorDependencyOptions = computed(() => {
  if (taskEditorId.value == null) return []
  const proc = taskPlanning.value?.processes?.find(
    (p: DtoDetailedProcess) => p.id === findTask(taskEditorId.value!)?.process_id,
  )
  const taken = new Set(
    ((proc?.dependencies ?? []) as DtoTaskDependency[])
      .filter((e: DtoTaskDependency) => e.task_id === taskEditorId.value)
      .map((e: DtoTaskDependency) => e.depends_on_task_id),
  )
  taken.add(taskEditorId.value ?? 0)
  return ((proc?.tasks ?? []) as DtoDetailedTask[])
    .filter((t: DtoDetailedTask) => t.parent_id == null && !taken.has(t.id))
    .map((t: DtoDetailedTask) => ({ value: t.id ?? 0, label: t.title ?? `#${t.id}` }))
})

async function onAddDependency(payload: { depends_on_task_id: number; type: DependencyType }) {
  if (taskEditorId.value == null) return
  taskEditorBusy.value = true
  taskEditorError.value = null
  // Mutation failures are reported by the global toast (http.ts) — no inline banner.
  await planning.addTaskDependency(taskEditorId.value, payload.depends_on_task_id, payload.type)
  taskEditorBusy.value = false
}

async function onChangeDependency(payload: { id: number; type: DependencyType }) {
  if (taskEditorId.value == null) return
  taskEditorBusy.value = true
  taskEditorError.value = null
  // Mutation failures are reported by the global toast (http.ts) — no inline banner.
  await planning.changeTaskDependencyType(payload.id, taskEditorId.value, payload.type)
  taskEditorBusy.value = false
}

async function onDeleteDependency(id: number) {
  if (taskEditorId.value == null) return
  taskEditorError.value = null
  // Mutation failures are reported by the global toast (http.ts) — no inline banner.
  await planning.deleteTaskDependency(id, taskEditorId.value)
}

function onContextMenu(p: { clientX: number; clientY: number; date: string | null; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }) {
  if (!canViewTasks.value) return
  // Empty group area: creation requires the corresponding right, a parent process and a known date.
  // A task row opens the menu for viewers (Comments); a milestone — only with a right on it.
  if (p.taskId == null && p.milestoneId == null) {
    if (!canCreateTask(p.processId) && !canCreateMilestone(p.processId)) return
    if (p.processId == null || p.date == null) return
  } else if (p.milestoneId != null) {
    const processId = findMilestone(p.milestoneId)?.process_id
    if (!canManageMilestone(processId) && !canDeleteMilestone(processId)) return
  }
  openMenu({ x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, processId: p.processId, taskId: p.taskId, milestoneId: p.milestoneId })
}

/** Right-click on the table header — the "Day"/"Decade" scale menu (after closing the actions menu) */
function onHeaderCtx(p: { clientX: number; clientY: number }) {
  closeMenu()
  openUnitMenu(p.clientX, p.clientY)
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

/** Click on a task bar — open the task editor. Editable for users with
 *  task.update on the task's process; everyone else with task.view gets the
 *  same modal in read-only mode (fields and operations disabled). */
function onTaskBarEdit(id: number) {
  const task = findTask(id)
  if (!task || !canViewTasks.value) return
  openTaskEdit(id)
}

function openMilestoneEdit(id: number) {
  const ms = findMilestone(id)
  if (ms) {
    openEdit({ type: 'milestone', id, title: ms.title ?? '', content: ms.content ?? '', color: ms.color ?? '' })
  }
}

async function handleSelect(id: string) {
  if (!menu.value) return
  const { date, rowIndex, processId, taskId, milestoneId } = menu.value
  if (id === 'create-task') {
    if (processId == null || date == null) return
    const proc = planning.taskPlanning?.processes?.find((p: DtoDetailedProcess) => p.id === processId)
    // A task is created within the bounds of the parent process keeping the default length:
    // a click outside the bounds clamps the span to the parent start/end but does not shrink it.
    const { start_date, end_date } = shiftSpanDates(
      date,
      addDaysISO(date, 7),
      proc?.start_date,
      proc?.end_date,
    )
    const _ok = await planning.createTask({
      title: t('plannerViews.planner.task.defaultTitle'),
      process_id: processId,
      start_date,
      end_date,
    }, rowIndex)
  } else if (id === 'create-milestone') {
    if (processId == null || date == null) return
    const proc = planning.taskPlanning?.processes?.find((p: DtoDetailedProcess) => p.id === processId)
    const milestoneTitle = t('plannerViews.planner.milestone.defaultTitle')
    await planning.createMilestone({
      title: milestoneTitle,
      content: milestoneTitle,
      process_id: processId,
      date: clampDateToBounds(date, proc?.start_date, proc?.end_date),
      // A new milestone appears with a vivid random color from the palette.
      color: randomPaletteColor(),
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
    ask(t('plannerViews.planner.confirm.deleteTask'), () => {
      void planning.deleteTask(taskId)
    })
  } else if (id === 'delete-milestone' && milestoneId != null) {
    ask(t('plannerViews.planner.confirm.deleteMilestone'), () => {
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
  return (task?.resources ?? []).map((r: DtoResource) => ({
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
  const allowed = seesAllResources.value || owners.length === 0 ? null : new Set(owners)
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
  // Mutation failures are reported by the global toast (http.ts) — no inline banner.
  await planning.assignResource(
    resourcesModalTaskId.value,
    payload.resource_id,
    payload.quantity,
  )
  resourcesBusy.value = false
}

async function onRemoveResource(payload: { resource_id: number }) {
  if (resourcesModalTaskId.value == null) return
  resourcesBusy.value = true
  resourcesError.value = null
  // Mutation failures are reported by the global toast (http.ts) — no inline banner.
  await planning.removeResource(
    resourcesModalTaskId.value,
    payload.resource_id,
  )
  resourcesBusy.value = false
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
  if (!canViewTasks.value) return
  commentsTaskId.value = taskId
  void planning.loadTaskComments(taskId)
}

async function onSendComment(payload: SendCommentPayload) {
  if (commentsTaskId.value == null) return
  await planning.createTaskComment(commentsTaskId.value, payload.content, payload.parent_id)
}

function onDeleteComment(payload: DeleteCommentPayload) {
  if (commentsTaskId.value == null) return
  ask(t('plannerViews.planner.confirm.deleteComment'), () => {
    void planning.deleteTaskComment(commentsTaskId.value ?? 0, payload.comment_id)
  })
}

onMounted(async () => {
  // Project priorities and resources are needed before tasks: processesByPriority sorts by them,
  // and when the timeline mounts the group order is already final (otherwise the navigation anchor drifts).
  // Projects are fetched by admin/dp/rp only; vp/worker do not have them (403) — sorting by id.
  if (canViewProjects.value && !app.projects.length) await app.loadProjects()
  // Full project snapshot (with priorities) — local-first from the cache; the background PULL
  // refreshes it. Used by processesByPriority instead of the truncated CRUD list (PAGE_SIZE).
  await planning.loadProjectPlanning()
  if (!resources.value.length) await app.loadResources()
  // User catalog — for task assignee names (owner_id → name)
  if (!app.users.length) await app.loadUsers()
  // Own employees — the pool of candidates for task "assignees"
  await app.loadMyStaff()
  // The availability calendar is refreshed on EVERY page entry: the timesheet may
  // have changed, and ResourceHeader must immediately show fresh availability.
  await app.loadCalendar()
  await planning.loadTaskPlanning()
  // Page-entry SWR (online): cache-first render, then re-read the planning
  // aggregates this page displays so recent mutations (own or foreign) land
  // within one network round-trip — not only on the slow PULL cycle.
  if (!isOffline.value) void scheduleNamedRefresh(['project-plan', 'process-plan', 'task-plan'])
})

/**
 * Processes on the Tasks page are sorted by the priority of their project
 * (priority first, then by id). Priorities come from the full planning snapshot
 * (planning.projectPlanning.projects — loaded local-first, refreshed by PULL);
 * the truncated CRUD list (app.projects, PAGE_SIZE) is only a fallback so the
 * sort does not drift once there are more projects than one page.
 */
const processesByPriority = computed(() => {
  const prio = new Map<number, number>()
  const snapshot = planning.projectPlanning?.projects
  const source = snapshot && snapshot.length ? snapshot : app.projects
  for (const p of source) {
    if (p.id != null) prio.set(p.id, p.priority ?? Number.MAX_SAFE_INTEGER)
  }
  let list = taskPlanning.value?.processes ?? []
  // vp-like scope (task.view = parent): show only processes in projects where
  // the user owns at least one process. The matrix is authoritative once loaded;
  // the preset is only a cold-start fallback (rp keeps the ancestor view — the
  // backend already scopes that list).
  if ((permsReady.value ? ['parent', 'up1'].includes(rbac.perm('task', 'view')) : role.value === 'vp') && userId.value != null) {
    const myProjects = new Set(
      list.filter((p: DtoDetailedProcess) => p.owner_id === userId.value).map((p: DtoDetailedProcess) => p.project_id),
    )
    list = list.filter((p: DtoDetailedProcess) => myProjects.has(p.project_id))
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
  processesByPriority.value.map((p: DtoDetailedProcess) => ({
    id: p.id,
    code: p.project_code,
    title: p.title ?? '',
    start_date: p.start_date ?? '',
    end_date: p.end_date ?? '',
    project_id: p.project_id,
    owner_id: p.owner_id ?? undefined,
    rows: (p.tasks ?? []).map((t: DtoDetailedTask) => ({
      id: t.id,
      title: t.title ?? '',
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      resources: (t.resources ?? []).map((r: DtoResource) => ({ id: r.id, code: r.code, title: r.title, quantity: r.quantity })),
    })),
    milestones: (p.milestones ?? []).map((m: DtoMilestone) => ({ id: m.id, title: m.title ?? '', date: m.date ?? '' })),
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
        :page-title="t('plannerViews.pdf.tasks')"
      />
      <HintButton hint="planner" />
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
      :can-manage="anyManageableTask"
      :reorderable="anyManageableTask"
      :focus-date="focusDate"
      :focus-group-id="focusGroupId"
      :comments-by-task="planning.commentsByTask"
      @change="(p) => planning.moveTask(p.id, p.start_date, p.end_date)"
      @milestone-change="(p) => planning.updateMilestoneDate(p.id, p.date)"
      @contextmenu="onContextMenu"
      @header-ctxmenu="onHeaderCtx"
      @reorder="(p) => void planning.reorderTasks(p.processId, p.from, p.to)"
      @milestone-edit="openMilestoneEdit"
      @visible-range="onVisibleRange"
      @edit="onTaskBarEdit"
      @request-comments="(id) => planning.loadTaskComments(id, { fresh: false })"
      @open-comments="openComments"
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

    <TaskEditor
      :open="taskEditorId != null"
      :task="taskEditorTask"
      :subtasks="taskEditorSubtasks"
      :owner-options="ownerOptions"
      :dependencies="taskEditorDependencies"
      :dependency-options="taskEditorDependencyOptions"
      :can-manage="taskEditorTask ? canManageTask(taskEditorTask.process_id) : false"
      :can-create-subtask="taskEditorTask ? canManageTask(taskEditorTask.process_id) : false"
      :can-manage-dependencies="taskEditorTask ? canManageTask(taskEditorTask.process_id) : false"
      :busy="taskEditorBusy"
      :error="taskEditorError"
      :disabled-reason="isOffline ? t('plannerViews.offline.disabled') : null"
      @save="onSaveTaskEditor"
      @add-subtask="onAddSubtask"
      @update-subtask="onUpdateSubtask"
      @delete-subtask="onDeleteSubtask"
      @add-dependency="onAddDependency"
      @update-dependency="onChangeDependency"
      @delete-dependency="onDeleteDependency"
      @close="closeTaskEdit"
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

    <TaskComments
      :open="commentsTaskId != null"
      :task-id="commentsTaskId ?? 0"
      :task-title="commentsTaskTitle"
      :comments="taskComments"
      :users="app.users"
      :busy="planning.commentsLoading"
      :error="planning.commentsError"
      :disabled-reason="isOffline ? t('plannerViews.offline.disabled') : null"
      :can-manage="canDeleteOthersComments"
      :user-id="userId"
      @send="onSendComment"
      @delete="onDeleteComment"
      @close="commentsTaskId = null"
    />
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.pp {
  /* The diagram fills the exact remaining viewport height (shell is vh-locked):
     the page itself never scrolls — only the timeline does (rows — vertical,
     calendar — horizontal). */
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* kept for nested previews (PdfExport / TaskComments) that still use the var */
  --planner-max-height: calc(100dvh - 112px);
}
.pp-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
  flex: none;
}

/* PlannerStates (.pg) and the timeline become a flex column: tg-scroll takes
   exactly the remaining height, internal overflow instead of a page scroll. */
.pp :deep(.pg) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pp :deep(.tg-scroll) {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
}
</style>
