<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import ProjectPlanning from '../components/planner/ProjectPlanning/ProjectPlanning.vue'
import { PdfExport } from '../components/planner'
import type { PdfGanttGroup } from '../components/planner/PdfExport/pdfRenderer'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { compareByName } from '../utils'
import { useEditModal } from '../composables/useEditModal'
import { usePlanningOrigin } from '../composables/usePlanningOrigin'
import { useUnitMenu } from '../composables/useUnitMenu'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useFindPlanningItem } from '../composables/useFindPlanningItem'
import { usePlanningStore, useAppStore } from '../store'
import { addMonthsISO } from '../components/planner/calendar'
import { CELL_WIDTH } from '../components/planner/layout'

const store = usePlanningStore()
const app = useAppStore()
const router = useRouter()
const { projectPlanning, loading, error } = storeToRefs(store)

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

/** Print model for PdfExport: one "Projects" group, rows = projects */
const projectGroups = computed<PdfGanttGroup[]>(() => {
  const rows = (projectPlanning.value?.projects ?? []).map((p: any) => ({
    id: p.id,
    title: p.project_code ?? '',
    start_date: p.start_date ?? '',
    end_date: p.end_date ?? '',
    project_id: p.id,
    owner_id: p.owner_id ?? undefined,
  }))
  return rows.length ? [{ id: 'projects', title: 'Проекты', rows }] : []
})

// Right-click menu on the table header: switching the "Day" / "Decade" scale
const { open: openUnitMenu, close: closeUnitMenu, select: selectUnit, bind: unitMenuBind } = useUnitMenu(unit)

// === Role permissions ===
// dp (project director): views and edits all projects, cannot delete
// rp (project manager): creates projects (becomes the owner), edits and deletes their own
const { role, userId, canCreateProject, canReorderProjects, canManageProject, canDeleteProject } = useRoleAccess()

const { findProject } = useFindPlanningItem()

// Right-click on an empty area: create-project menu (date under the cursor, inserted at the right-click position)
// Right-click on a project bar: edit/delete menu for the project
interface MenuState {
  x: number
  y: number
  date: string | null
  rowIndex: number
  projectId?: number
}
const menu = ref<MenuState | null>(null)

// Delete confirmation dialog (instead of window.confirm — it is blocked in iframes/sandboxes)
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

/** Transient success feedback (e.g. what the auto-create template added) */
const feedback = ref('')
let feedbackTimer: number | undefined
function showFeedback(text: string) {
  feedback.value = text
  if (feedbackTimer) window.clearTimeout(feedbackTimer)
  feedbackTimer = window.setTimeout(() => {
    feedback.value = ''
    feedbackTimer = undefined
  }, 6000)
}
onBeforeUnmount(() => {
  if (feedbackTimer) window.clearTimeout(feedbackTimer)
})

const menuItems = computed<ContextMenuItem[]>(() => {
  if (menu.value?.projectId != null) {
    const id = menu.value.projectId
    const items: ContextMenuItem[] = []
    if (canManageProject(id)) {
      items.push({ id: 'edit-project', label: 'Редактировать' })
    }
    if (canDeleteProject(id)) {
      items.push({ id: 'delete-project', label: 'Удалить проект' })
    }
    return items
  }
  return canCreateProject.value
    ? [{ id: 'create-project', label: 'Создать проект' }]
    : []
})

const ownerOptions = computed(() =>
  app.users
    .filter((u) => u.role !== 'worker')
    .sort(compareByName)
    .map((u) => ({ value: u.id ?? 0, label: u.name ?? '' })),
)

// Project edit modal (code, owner)
interface EditState {
  id: number
  code: string
  ownerId?: number
}
const { open: openEdit, close: closeEdit, submit: submitEdit, bind: editBind } = useEditModal<EditState>(
  (state) => {
    const fields: ModalField[] = [
      { key: 'code', label: 'Код проекта', type: 'text', value: state.code, required: true },
    ]
    // The project owner cannot be changed: the field is hidden for rp, admin sees it
    if (role.value === 'admin') {
      fields.push({
        key: 'owner_id',
        label: 'Владелец',
        type: 'select',
        value: state.ownerId,
        options: ownerOptions.value,
      })
    }
    return fields
  },
  async (state, values) => {
    const patch: { code: string; owner_id?: number } = { code: String(values.code ?? '') }
    // The project owner cannot be changed: owner_id is sent only for admin
    if (role.value === 'admin' && values.owner_id !== '' && values.owner_id != null) {
      patch.owner_id = Number(values.owner_id)
    }
    const ok = await store.updateProjectMeta(state.id, patch)
    return { ok, error: ok ? null : store.error }
  },
  () => 'Редактировать проект',
)

function onContextMenu(p: { clientX: number; clientY: number; date: string | null; rowIndex: number; projectId?: number }) {
  // Project bar: open the menu only if there are rights to manage the project
  if (p.projectId != null) {
    if (!canManageProject(p.projectId)) return
    openMenu({ x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, projectId: p.projectId })
    return
  }
  // Empty area: create menu only for roles with the create right and when the date is known
  if (!canCreateProject.value || p.date == null) return
  openMenu({ x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex })
}

/** Right-click on the table header — the "Day"/"Decade" scale menu (after closing the actions menu) */
function onHeaderCtx(p: { clientX: number; clientY: number }) {
  closeMenu()
  openUnitMenu(p.clientX, p.clientY)
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openProjectEdit(id: number) {
  const p = findProject(id)
  if (p) {
    openEdit({ id, code: p.project_code ?? '', ownerId: p.owner_id })
  }
}

async function handleSelect(id: string) {
  if (!menu.value) return
  const { date, projectId } = menu.value
  if (id === 'create-project' && date != null) {
    const res = await store.createProject({
      code: 'КО_' + Date.now(),
      start_date: date,
      end_date: addMonthsISO(date, 6),
    })
    if (!res.ok) {
      error.value = store.error
    } else if (res.autoCreated) {
      const a = res.autoCreated
      showFeedback(
        'Проект создан. По шаблону автосоздания добавлено: процессов — ' +
          a.processes +
          ', задач — ' +
          a.tasks +
          ', назначений ресурсов — ' +
          a.assignments,
      )
    }
  } else if (id === 'edit-project' && projectId != null) {
    openProjectEdit(projectId)
  } else if (id === 'delete-project' && projectId != null) {
    ask('Удалить проект? Это удалит все его процессы, задачи и вехи.', () => {
      void store.deleteProject(projectId)
    })
  }
}

async function onReorder(e: { from: number; to: number }) {
  const ok = await store.reorderProjects(e.from, e.to)
  if (!ok) error.value = store.error
}

/** Click on a project bar — navigate to the processes tab anchored at the project start */
function goToProcesses(projectId: number) {
  router.push({ path: '/processes', query: { project: String(projectId) } })
}

onMounted(() => {
  store.loadProjectPlanning()
  if (!app.users.length) void app.loadUsers()
})
</script>

<template>
  <section class="pp">
    <!-- Printing the projects diagram as PDF: the period and cell width from the page -->
    <div class="pp-toolbar">
      <PdfExport
        :groups="projectGroups"
        :origin="origin"
        :unit="unit"
        :owner-id="userId"
        :role="role"
        scope="projects"
        :period-from="viewRange.from"
        :period-to="viewRange.to"
        :scale="viewRange.scale"
        page-title="Диаграмма проектов"
      />
    </div>

    <p v-if="feedback" class="pp-fb" role="status">{{ feedback }}</p>

    <ProjectPlanning
      :projects="projectPlanning?.projects || []"
      :loading="loading"
      :error="error"
      :users="app.users"
      :origin="origin"
      :unit="unit"
      :reorderable="canReorderProjects"
      :can-manage="canManageProject"
      @change="(p) => store.updateProjectDates(p.id, p.start_date, p.end_date)"
      @contextmenu="onContextMenu"
      @header-ctxmenu="onHeaderCtx"
      @reorder="onReorder"
      @navigate="goToProcesses"
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
.pp-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.pp-fb {
  margin: 0 0 12px;
  padding: 8px 12px;
  background: #e6f4ea;
  color: #1e8e3e;
  border: 1px solid #b7dfc0;
  border-radius: 8px;
  font-size: 13px;
}
.pp-st {
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: #d93025; }
</style>
