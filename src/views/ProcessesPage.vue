<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import ProcessPlanning from '../components/planner/ProcessPlanning/ProcessPlanning.vue'
import { ContextMenu, ModalForm } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { usePlanningStore, useAppStore } from '../store'
import type { PlanningMode, PlanningUnit } from '../components/planner/calendar'
import { addMonthsISO } from '../components/planner/calendar'

const store = usePlanningStore()
const app = useAppStore()
const { processPlanning, loading, error } = storeToRefs(store)

const mode = ref<PlanningMode>('quarter')
const unit = ref<PlanningUnit>('day')
const anchor = ref<Date | null>(null)

const modeOptions: { value: PlanningMode; label: string }[] = [
  { value: 'quarter', label: '3 месяца' },
  { value: 'half', label: 'Полгода' },
  { value: 'year', label: 'Год' },
]

const unitOptions: { value: PlanningUnit; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'decade', label: 'Декада' },
]

// ПКМ по пустому месту группы: создание процесса в проекте-родителе.
// Дата под курсором, вставка строки в позицию ПКМ.
// ПКМ по бару процесса: меню редактирования/удаления процесса.
interface MenuState {
  x: number
  y: number
  date: string
  rowIndex: number
  projectId?: number
  processId?: number
}
const menu = ref<MenuState | null>(null)
const menuItems = computed<ContextMenuItem[]>(() =>
  menu.value?.processId != null
    ? [
        { id: 'edit-process', label: 'Редактировать' },
        { id: 'delete-process', label: 'Удалить процесс' },
      ]
    : [{ id: 'create-process', label: 'Создать процесс' }],
)

// Модалка редактирования процесса (название, владелец)
interface EditState {
  id: number
  title: string
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
  return [
    { key: 'title', label: 'Название', type: 'text', value: edit.value.title, required: true },
    { key: 'owner_id', label: 'Владелец', type: 'select', value: edit.value.ownerId, options: ownerOptions.value },
  ]
})

function onContextMenu(p: { clientX: number; clientY: number; date: string; rowIndex: number; projectId?: number; processId?: number }) {
  menu.value = { x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, projectId: p.projectId, processId: p.processId }
}

function openProcessEdit(id: number) {
  const proc = store.processPlanning?.projects
    ?.flatMap((p: any) => p.processes ?? [])
    .find((x: any) => x.id === id)
  if (proc) {
    edit.value = { id, title: proc.title ?? '', ownerId: proc.owner_id }
    editError.value = null
  }
}

async function onSelect(id: string) {
  if (!menu.value) return
  const { date, rowIndex, projectId, processId } = menu.value
  if (id === 'create-process') {
    if (projectId == null) return
    const ok = await store.createProcess({
      title: 'Новый процесс',
      project_id: projectId,
      start_date: date,
      end_date: addMonthsISO(date, 3),
    }, rowIndex)
    if (!ok) error.value = store.error
  } else if (id === 'edit-process' && processId != null) {
    openProcessEdit(processId)
  } else if (id === 'delete-process' && processId != null) {
    if (!window.confirm('Удалить процесс? Это удалит все его задачи и вехи.')) return
    const ok = await store.deleteProcess(processId)
    if (!ok) error.value = store.error
  }
}

async function onEditSave(values: Record<string, string | number>) {
  if (!edit.value) return
  saving.value = true
  editError.value = null
  const ownerId = values.owner_id !== '' ? Number(values.owner_id) : undefined
  const ok = await store.updateProcessMeta(edit.value.id, { title: String(values.title ?? ''), owner_id: ownerId })
  saving.value = false
  if (ok) edit.value = null
  else editError.value = store.error
}

onMounted(() => {
  store.loadProcessPlanning()
  if (!app.users.length) void app.loadUsers()
})
</script>

<template>
  <section class="pp">
    <div class="pp-head">
      <h2 class="pp-title">Процессы</h2>
      <div class="pp-period">
        <button
          v-for="opt in modeOptions"
          :key="opt.value"
          class="pp-period-btn"
          :class="{ active: mode === opt.value }"
          type="button"
          @click="mode = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
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

    <ProcessPlanning
      :projects="processPlanning?.projects || []"
      :loading="loading"
      :error="error"
      :users="app.users"
      :anchor="anchor"
      :mode="mode"
      :unit="unit"
      @change="(p) => store.updateProcessDates(p.id, p.start_date, p.end_date)"
      @contextmenu="onContextMenu"
      @edit="openProcessEdit"
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
      title="Редактировать процесс"
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
.pp-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
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
