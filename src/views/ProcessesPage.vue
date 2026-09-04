<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import ProcessPlanning from '../components/planner/ProcessPlanning/ProcessPlanning.vue'
import { PdfExport } from '../components/planner'
import type { PdfGanttGroup } from '../components/planner/PdfExport/pdfRenderer'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { usePlanningOrigin } from '../composables/usePlanningOrigin'
import { useUnitMenu } from '../composables/useUnitMenu'
import { compareByName } from '../utils'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useFindPlanningItem } from '../composables/useFindPlanningItem'
import { usePlanningStore, useAppStore } from '../store'
import { addMonthsISO, shiftSpanDates } from '../components/planner/calendar'
import { CELL_WIDTH } from '../components/planner/layout'

const store = usePlanningStore()
const app = useAppStore()
const router = useRouter()
const route = useRoute()
const { processPlanning, loading, error } = storeToRefs(store)

const { unit, origin } = usePlanningOrigin()

/** Current visible timeline window (the period "as on screen") + zoom — for PDF export */
const viewRange = ref<{ from: string; to: string; cellWidthPx: number; scale: number }>({
  from: '',
  to: '',
  cellWidthPx: CELL_WIDTH,
  scale: 1,
})
function onVisibleRange(v: { from: string; to: string; cellWidthPx: number; scale: number }) {
  viewRange.value = v
}

/** Print model for PdfExport: a project = a group, processes = rows */
const processGroups = computed<PdfGanttGroup[]>(() =>
  (processPlanning.value?.projects ?? []).map((project: any) => ({
    id: project.id,
    code: project.project_code ?? '',
    title: '',
    start_date: project.start_date ?? '',
    end_date: project.end_date ?? '',
    project_id: project.id,
    rows: (project.processes ?? []).map((p: any) => ({
      id: p.id,
      title: p.title ?? '',
      start_date: p.start_date ?? '',
      end_date: p.end_date ?? '',
      project_id: p.project_id ?? project.id,
      owner_id: p.owner_id ?? undefined,
    })),
  })),
)

// Right-click menu on the table header: switching the "Day" / "Decade" scale
const { open: openUnitMenu, close: closeUnitMenu, select: selectUnit, bind: unitMenuBind } = useUnitMenu(unit)

// dp (project director) — read-only; rp manages the processes of their projects,
// vp/worker — no rights (the process list for them is already filtered by the backend).
const { canCreateProcess, canManageProcess, canDeleteProcess, role, userId } = useRoleAccess()

/** Drag/resize/reorder are enabled when the user can manage at least one visible process */
const anyManageableProcess = computed(() =>
  (processPlanning.value?.projects ?? []).some((p: any) =>
    (p.processes ?? []).some((pr: any) => canManageProcess(pr.id)),
  ),
)

const { findProcess } = useFindPlanningItem()

/** Timeline anchor when navigating from the projects tab (click on a project bar) */
const focusDate = computed(() => {
  const id = Number(route.query.project)
  if (!id) return null
  const project = store.processPlanning?.projects?.find((p: any) => p.id === id)
  return project?.start_date ?? null
})

/** Vertical scroll to the project group (row) */
const focusGroupId = computed(() => {
  const id = Number(route.query.project)
  return id ? id : null
})

/** Click on a process bar — navigate to the tasks tab anchored at the first days of the process */
function goToTasks(processId: number) {
  router.push({ path: '/planner', query: { process: String(processId) } })
}

// Right-click on an empty group area: create a process in the parent project.
// The date is under the cursor, the row is inserted at the right-click position.
// Right-click on a process bar: edit/delete menu for the process.
interface MenuState {
  x: number
  y: number
  date: string | null
  rowIndex: number
  projectId?: number
  processId?: number
}
const menu = ref<MenuState | null>(null)

// Delete confirmation dialog (instead of window.confirm — it is blocked in iframes/sandboxes)
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

const menuItems = computed<ContextMenuItem[]>(() => {
  if (menu.value?.processId == null) {
    return canCreateProcess.value ? [{ id: 'create-process', label: 'Создать процесс' }] : []
  }
  const processId = menu.value.processId
  const items: ContextMenuItem[] = []
  if (canManageProcess(processId)) items.push({ id: 'edit-process', label: 'Редактировать' })
  if (canDeleteProcess(processId)) items.push({ id: 'delete-process', label: 'Удалить процесс' })
  return items
})

const ownerOptions = computed(() =>
  app.users
    .filter((u) => u.preset !== 'worker')
    .sort(compareByName)
    .map((u) => ({ value: u.id ?? 0, label: u.name ?? '' })),
)

// Process edit modal (title, owner, color)
interface EditState {
  id: number
  title: string
  ownerId?: number
  color?: string
}
const { open: openEdit, close: closeEdit, submit: submitEdit, bind: editBind } = useEditModal<EditState>(
  (state) => [
    { key: 'title', label: 'Название', type: 'text', value: state.title, required: true },
    { key: 'color', label: 'Цвет', type: 'color', value: state.color ?? '' },
    { key: 'owner_id', label: 'Владелец', type: 'select', value: state.ownerId, options: ownerOptions.value },
  ],
  async (state, values) => {
    const ownerId = values.owner_id !== '' ? Number(values.owner_id) : undefined
    const ok = await store.updateProcessMeta(state.id, {
      title: String(values.title ?? ''),
      color: String(values.color ?? ''),
      owner_id: ownerId,
    })
    return { ok, error: ok ? null : store.error }
  },
  () => 'Редактировать процесс',
)

function onContextMenu(p: { clientX: number; clientY: number; date: string | null; rowIndex: number; projectId?: number; processId?: number }) {
  // Empty group area: creating a process requires the create right, a parent project and a known date
  if (p.processId == null) {
    if (!canCreateProcess.value) return
    if (p.projectId == null || p.date == null) return
  } else if (!canManageProcess(p.processId) && !canDeleteProcess(p.processId)) {
    return
  }
  openMenu({ x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, projectId: p.projectId, processId: p.processId })
}

/** Right-click on the table header — the "Day"/"Decade" scale menu (after closing the actions menu) */
function onHeaderCtx(p: { clientX: number; clientY: number }) {
  closeMenu()
  openUnitMenu(p.clientX, p.clientY)
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openProcessEdit(id: number) {
  const proc = findProcess(id)
  if (proc) {
    openEdit({ id, title: proc.title ?? '', ownerId: proc.owner_id, color: proc.color ?? '' })
  }
}

async function handleSelect(id: string) {
  if (!menu.value) return
  const { date, rowIndex, projectId, processId } = menu.value
  if (id === 'create-process') {
    if (projectId == null || date == null) return
    const project = store.processPlanning?.projects?.find((p: any) => p.id === projectId)
    // A process is created within the bounds of the parent project keeping the default length:
    // a click outside the bounds clamps the span to the parent start/end but does not shrink it.
    const { start_date, end_date } = shiftSpanDates(
      date,
      addMonthsISO(date, 3),
      project?.start_date,
      project?.end_date,
    )
    const ok = await store.createProcess({
      title: 'Новый процесс',
      project_id: projectId,
      start_date,
      end_date,
    }, rowIndex)
    if (!ok) error.value = store.error
  } else if (id === 'edit-process' && processId != null) {
    openProcessEdit(processId)
  } else if (id === 'delete-process' && processId != null) {
    ask('Удалить процесс? Это удалит все его задачи и вехи.', () => {
      void store.deleteProcess(processId)
    })
  }
}

onMounted(() => {
  store.loadProcessPlanning()
  if (!app.users.length) void app.loadUsers()
})
</script>

<template>
  <section class="pp">
    <!-- Printing the processes diagram as PDF: the period and cell width from the page -->
    <div class="pp-toolbar">
      <PdfExport
        :groups="processGroups"
        :origin="origin"
        :unit="unit"
        :owner-id="userId"
        :role="role"
        scope="processes"
        :period-from="viewRange.from"
        :period-to="viewRange.to"
        :scale="viewRange.scale"
        page-title="Диаграмма процессов"
      />
    </div>

    <ProcessPlanning
      :projects="processPlanning?.projects || []"
      :loading="loading"
      :error="error"
      :users="app.users"
      :origin="origin"
      :unit="unit"
      :can-manage="anyManageableProcess"
      :reorderable="anyManageableProcess"
      :focus-date="focusDate"
      :focus-group-id="focusGroupId"
      @change="(p) => store.updateProcessDates(p.id, p.start_date, p.end_date)"
      @contextmenu="onContextMenu"
      @header-ctxmenu="onHeaderCtx"
      @reorder="(p) => void store.reorderProcesses(p.projectId, p.from, p.to)"
      @navigate="goToTasks"
      @visible-range="onVisibleRange"
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
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.pp {
  /* Diagram fills the exact viewport height; the page never scrolls —
     only the timeline does (rows vertical, calendar horizontal). */
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  --planner-max-height: calc(100dvh - 112px);
}

/* PlannerStates (.pg) + timeline as a flex column: tg-scroll fills the rest */
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

.pp-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
  flex: none;
}
.pp-st {
  color: var(--ui-text-2);
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: var(--ui-danger); }
</style>
