<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import ProcessPlanning from '../components/planner/ProcessPlanning/ProcessPlanning.vue'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { usePlanningOrigin } from '../composables/usePlanningOrigin'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useFindPlanningItem } from '../composables/useFindPlanningItem'
import { usePlanningStore, useAppStore } from '../store'
import { addMonthsISO, shiftSpanDates } from '../components/planner/calendar'

const store = usePlanningStore()
const app = useAppStore()
const router = useRouter()
const route = useRoute()
const { processPlanning, loading, error } = storeToRefs(store)

const { unit, origin, unitOptions } = usePlanningOrigin()

// dp (директор проектов) — read-only: может менять только приоритет проектов,
// поэтому создание/редактирование/удаление процессов и перенос их дат недоступны.
const { canManage } = useRoleAccess()

const { findProcess } = useFindPlanningItem()

/** Якорь шкалы при навигации с вкладки проектов (клик по бару проекта) */
const focusDate = computed(() => {
  const id = Number(route.query.project)
  if (!id) return null
  const project = store.processPlanning?.projects?.find((p: any) => p.id === id)
  return project?.start_date ?? null
})

/** Клик по бару процесса — переход на вкладку задач с якорем на первые дни процесса */
function goToTasks(processId: number) {
  router.push({ path: '/planner', query: { process: String(processId) } })
}

// ПКМ по пустому месту группы: создание процесса в проекте-родителе.
// Дата под курсором, вставка строки в позицию ПКМ.
// ПКМ по бару процесса: меню редактирования/удаления процесса.
interface MenuState {
  x: number
  y: number
  date: string | null
  rowIndex: number
  projectId?: number
  processId?: number
}
const menu = ref<MenuState | null>(null)

// Диалог подтверждения удаления (вместо window.confirm — блокируется в iframe/песочнице)
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

const menuItems = computed<ContextMenuItem[]>(() => {
  if (!canManage.value) return []
  return menu.value?.processId != null
    ? [
        { id: 'edit-process', label: 'Редактировать' },
        { id: 'delete-process', label: 'Удалить процесс' },
      ]
    : [{ id: 'create-process', label: 'Создать процесс' }]
})

const ownerOptions = computed(() =>
  app.users.map((u) => ({ value: u.id ?? 0, label: u.name ?? '' })),
)

// Модалка редактирования процесса (название, владелец)
interface EditState {
  id: number
  title: string
  ownerId?: number
}
const { open: openEdit, close: closeEdit, submit: submitEdit, bind: editBind } = useEditModal<EditState>(
  (state) => [
    { key: 'title', label: 'Название', type: 'text', value: state.title, required: true },
    { key: 'owner_id', label: 'Владелец', type: 'select', value: state.ownerId, options: ownerOptions.value },
  ],
  async (state, values) => {
    const ownerId = values.owner_id !== '' ? Number(values.owner_id) : undefined
    const ok = await store.updateProcessMeta(state.id, { title: String(values.title ?? ''), owner_id: ownerId })
    return { ok, error: ok ? null : store.error }
  },
  () => 'Редактировать процесс',
)

function onContextMenu(p: { clientX: number; clientY: number; date: string | null; rowIndex: number; projectId?: number; processId?: number }) {
  if (!canManage.value) return
  // Пустое место группы: создание процесса требует проект-родителя и известной даты
  if (p.processId == null && (p.projectId == null || p.date == null)) return
  openMenu({ x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, projectId: p.projectId, processId: p.processId })
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openProcessEdit(id: number) {
  const proc = findProcess(id)
  if (proc) {
    openEdit({ id, title: proc.title ?? '', ownerId: proc.owner_id })
  }
}

async function handleSelect(id: string) {
  if (!menu.value) return
  const { date, rowIndex, projectId, processId } = menu.value
  if (id === 'create-process') {
    if (projectId == null || date == null) return
    const project = store.processPlanning?.projects?.find((p: any) => p.id === projectId)
    // Процесс создаётся в пределах проекта-родителя с сохранением дефолтной длины:
    // клик вне границ прижимает спана к началу/концу родителя, но не ужимает его.
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

    <ProcessPlanning
      :projects="processPlanning?.projects || []"
      :loading="loading"
      :error="error"
      :users="app.users"
      :origin="origin"
      :unit="unit"
      :can-manage="canManage"
      :focus-date="focusDate"
      @change="(p) => store.updateProcessDates(p.id, p.start_date, p.end_date)"
      @contextmenu="onContextMenu"
      @edit="openProcessEdit"
      @navigate="goToTasks"
    />

    <ContextMenu v-bind="menuBind" @select="select" @close="closeMenu" />

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
