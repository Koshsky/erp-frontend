<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import ProjectPlanning from '../components/planner/ProjectPlanning/ProjectPlanning.vue'
import { ContextMenu, ModalForm } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { usePlanningStore, useAppStore, useAuthStore } from '../store'
import type { PlanningUnit } from '../components/planner/calendar'
import { addMonthsISO } from '../components/planner/calendar'

const store = usePlanningStore()
const app = useAppStore()
const auth = useAuthStore()
const { projectPlanning, loading, error } = storeToRefs(store)

const unit = ref<PlanningUnit>('day')

/** Якорь шкалы: первое число предыдущего месяца от сегодня */
const origin = computed(() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 1)
})

const unitOptions: { value: PlanningUnit; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'decade', label: 'Декада' },
]

// ПКМ по пустому месту: меню создания проекта (дата под курсором, вставка в позицию ПКМ)
// ПКМ по бару проекта: меню редактирования/удаления проекта
interface MenuState {
  x: number
  y: number
  date: string | null
  rowIndex: number
  projectId?: number
}
const menu = ref<MenuState | null>(null)

// === Права по ролям ===
// dp (директор проектов): просматривает все, меняет только приоритет (переупорядочивание)
// rp (руководитель проекта): создаёт проекты (сам становится owner), редактирует и удаляет свои
const role = computed(() => auth.user?.role)
const currentUserId = computed(() => auth.user?.id)

const canCreateProject = computed(() => role.value === 'admin' || role.value === 'rp')
const canReorderProjects = computed(() =>
  role.value === 'admin' || role.value === 'dp' || role.value === 'rp',
)

/** Может ли пользователь редактировать/удалять/двигать проект: admin — любой, rp — только свой */
function canManageProject(projectId: number): boolean {
  if (role.value === 'admin') return true
  if (role.value !== 'rp') return false
  const project = store.projectPlanning?.projects?.find((x: any) => x.id === projectId)
  return project?.owner_id != null && project.owner_id === currentUserId.value
}

const menuItems = computed<ContextMenuItem[]>(() => {
  if (menu.value?.projectId != null) {
    if (!canManageProject(menu.value.projectId)) return []
    return [
      { id: 'edit-project', label: 'Редактировать' },
      { id: 'delete-project', label: 'Удалить проект' },
    ]
  }
  return canCreateProject.value
    ? [{ id: 'create-project', label: 'Создать проект' }]
    : []
})

// Модалка редактирования проекта (код, владелец)
interface EditState {
  id: number
  code: string
  ownerId?: number
}
const edit = ref<EditState | null>(null)
const saving = ref(false)
const editError = ref<string | null>(null)

const ownerOptions = computed(() =>
  app.users.map((u) => ({ value: u.id ?? 0, label: u.name ?? '' })),
)

const editFields = computed<ModalField[]>(() => {
  if (!edit.value) return []
  const fields: ModalField[] = [
    { key: 'code', label: 'Код проекта', type: 'text', value: edit.value.code, required: true },
  ]
  // Владелец проекта не может быть изменён: у rp поле скрываем, admin его видит
  if (role.value === 'admin') {
    fields.push({
      key: 'owner_id',
      label: 'Владелец',
      type: 'select',
      value: edit.value.ownerId,
      options: ownerOptions.value,
    })
  }
  return fields
})

function onContextMenu(p: { clientX: number; clientY: number; date: string | null; rowIndex: number; projectId?: number }) {
  // Бар проекта: меню открываем только если есть права на управление проектом
  if (p.projectId != null) {
    if (!canManageProject(p.projectId)) return
    menu.value = { x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, projectId: p.projectId }
    return
  }
  // Пустое место: меню создания только для ролей с правом создания и при известной дате
  if (!canCreateProject.value || p.date == null) return
  menu.value = { x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex }
}

function openProjectEdit(id: number) {
  const p = store.projectPlanning?.projects?.find((x: any) => x.id === id)
  if (p) {
    edit.value = { id, code: p.project_code ?? '', ownerId: p.owner_id }
    editError.value = null
  }
}

async function onSelect(id: string) {
  if (!menu.value) return
  const { date, rowIndex, projectId } = menu.value
  if (id === 'create-project' && date != null) {
    const ok = await store.createProject({
      code: 'КО_' + Date.now(),
      start_date: date,
      end_date: addMonthsISO(date, 6),
    }, rowIndex)
    if (!ok) error.value = store.error
  } else if (id === 'edit-project' && projectId != null) {
    openProjectEdit(projectId)
  } else if (id === 'delete-project' && projectId != null) {
    if (!window.confirm('Удалить проект? Это удалит все его процессы, задачи и вехи.')) return
    const ok = await store.deleteProject(projectId)
    if (!ok) error.value = store.error
  }
}

async function onReorder(e: { from: number; to: number }) {
  const ok = await store.reorderProjects(e.from, e.to)
  if (!ok) error.value = store.error
}

async function onEditSave(values: Record<string, string | number>) {
  if (!edit.value) return
  saving.value = true
  editError.value = null
  const patch: { code: string; owner_id?: number } = { code: String(values.code ?? '') }
  // Владельца проекта изменить нельзя: owner_id отправляем только для admin
  if (role.value === 'admin' && values.owner_id !== '' && values.owner_id != null) {
    patch.owner_id = Number(values.owner_id)
  }
  const ok = await store.updateProjectMeta(edit.value.id, patch)
  saving.value = false
  if (ok) edit.value = null
  else editError.value = store.error
}

onMounted(() => {
  store.loadProjectPlanning()
  if (!app.users.length) void app.loadUsers()
})
</script>

<template>
  <section class="pp">
    <div class="pp-head">
      <div class="pp-period">
        <button
          v-for="opt in unitOptions"
          :key="opt.value"
          class="pp-period-btn"
          :class="{ active: unit === opt.value }"
          type="button"
          @click="unit = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

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
      @reorder="onReorder"
      @edit="openProjectEdit"
    />

    <ContextMenu
      :open="!!menu"
      :x="menu?.x ?? 0"
      :y="menu?.y ?? 0"
      :items="menuItems"
      @select="onSelect"
      @close="menu = null"
    />

    <ModalForm
      :open="!!edit"
      title="Редактировать проект"
      :fields="editFields"
      :busy="saving"
      :error="editError"
      @save="onEditSave"
      @close="edit = null"
    />
  </section>
</template>

<style scoped>
.pp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}
.pp-period {
  display: inline-flex;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}
.pp-period-btn {
  border: none;
  background: transparent;
  padding: 8px 16px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.pp-period-btn + .pp-period-btn {
  border-left: 1px solid #e0e0e0;
}
.pp-period-btn:hover:not(.active) {
  background: #f6f8fa;
}
.pp-period-btn.active {
  background: #1a73e8;
  color: #fff;
  font-weight: 600;
}
.pp-st {
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: #d93025; }
</style>
