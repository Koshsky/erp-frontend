<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useAppStore, useTimesheetStore } from '../store'
import { compareByName } from '../utils'
import type { DtoUserResponse } from '@/api'

const ts = useTimesheetStore()
const { employees, employeesWithTitles, loading, error } = storeToRefs(ts)

const app = useAppStore()
const { users } = storeToRefs(app)

// Редактирование/удаление: admin — любого, остальные (vp) — только подчинённых
const { role, userId, canManageEmployees, canEditEmployee } = useRoleAccess()
const isAdmin = computed(() => role.value === 'admin')

/** Дата DD.MM.YYYY или «—» */
function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Подпись руководителя сотрудника */
function managerLabel(managerId?: number | null): string {
  if (managerId == null) return '—'
  if (managerId === userId.value) return 'Я'
  const u = users.value.find((x) => x.id === managerId)
  return u?.name ?? `#${managerId}`
}

/** Поиск по ФИО и должности (регистронезависимый) */
const search = ref('')

/** Фильтр по руководителю (manager_id): '' — все, 'none' — без руководителя (клиент), число — серверный фильтр */
const managerFilter = ref<number | 'none' | ''>('')
const filteredEmployees = computed(() => {
  let list = employeesWithTitles.value
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter((e) => `${e.name ?? ''} ${e.position ?? ''}`.toLowerCase().includes(q))
  }
  // 'none' (без руководителя) фильтруем на клиенте; числовой manager_id уже отфильтрован сервером
  if (managerFilter.value === 'none') {
    list = list.filter((e) => e.manager_id == null)
  }
  return list
})

// Смена фильтра руководителя перезагружает листинг с manager_id (только для admin)
watch(managerFilter, (v) => {
  if (isAdmin.value) ts.fetchEmployees(typeof v === 'number' ? v : undefined)
})

// ПКМ по строке: редактирование/удаление (только свои сотрудники / admin)
interface MenuState {
  x: number
  y: number
  employeeId: number
}
const menu = ref<MenuState | null>(null)
const menuItems = computed<ContextMenuItem[]>(() => [
  { id: 'edit-employee', label: 'Редактировать' },
  { id: 'delete-employee', label: 'Удалить сотрудника' },
])

// Диалог подтверждения удаления
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

type ModalMode =
  | { type: 'create' }
  | {
      type: 'edit'
      id: number
      lastName: string
      firstName: string
      middleName?: string
      position?: string
      managerId?: number | null
      hireDate?: string
      terminationDate?: string
    }

/** Варианты руководителей (пользователей, без workers) + «Без руководителя» */
const managerOptions = computed<ModalField['options']>(() => [
  { value: '', label: 'Без руководителя' },
  ...users.value
    .filter((u) => u.id != null && u.role !== 'worker')
    .sort(compareByName)
    .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
])

const { open: openModal, close: closeModal, submit: submitModal, bind: modalBind } = useEditModal<ModalMode>(
  (state) => {
    const fields: ModalField[] = [
      {
        key: 'lastName',
        label: 'Фамилия',
        type: 'text',
        value: state.type === 'edit' ? state.lastName : '',
        required: true,
      },
      {
        key: 'firstName',
        label: 'Имя',
        type: 'text',
        value: state.type === 'edit' ? state.firstName : '',
        required: true,
      },
      {
        key: 'middleName',
        label: 'Отчество',
        type: 'text',
        value: state.type === 'edit' ? (state.middleName ?? '') : '',
      },
      {
        key: 'position',
        label: 'Должность',
        type: 'text',
        value: state.type === 'edit' ? (state.position ?? '') : '',
        placeholder: 'Свободный текст, например «Ведущий инженер»',
      },
    ]
    fields.push(
      { key: 'hireDate', label: 'Дата приёма', type: 'date', value: state.type === 'edit' ? state.hireDate : '' },
      { key: 'terminationDate', label: 'Дата увольнения', type: 'date', value: state.type === 'edit' ? state.terminationDate : '' },
    )
    // Руководителя выбирает только admin; vp создаёт сотрудников себе в подчинение
    if (isAdmin.value) {
      fields.push({
        key: 'managerId',
        label: 'Руководитель',
        type: 'select',
        options: managerOptions.value,
        value: state.type === 'edit' ? (state.managerId ?? '') : '',
      })
    }
    return fields
  },
  async (state, values) => {
    const payload: { last_name: string; first_name: string; middle_name?: string; role?: string; position?: string; manager_id?: number; hire_date?: string; termination_date?: string } = {
      last_name: String(values.lastName ?? '').trim(),
      first_name: String(values.firstName ?? '').trim(),
      middle_name: String(values.middleName ?? '').trim() || undefined,
    }
    if (values.position != null) {
      payload.position = String(values.position).trim()
    }
    if (values.hireDate) payload.hire_date = String(values.hireDate)
    if (values.terminationDate) payload.termination_date = String(values.terminationDate)
    // Руководителя шлём только admin и только если выбран явно (иначе — без изменений)
    if (isAdmin.value && values.managerId !== '' && values.managerId != null) {
      payload.manager_id = Number(values.managerId)
    }
    const ok =
      state.type === 'create'
        ? await ts.createEmployee({ ...payload, role: 'worker' })
        : await ts.updateEmployee(state.id, payload)
    return { ok, error: ok ? null : error.value }
  },
  (state) => (state.type === 'create' ? 'Создать сотрудника' : 'Редактировать сотрудника'),
  (state) => (state.type === 'create' ? 'Создать' : 'Сохранить'),
)

function onRowContextMenu(e: MouseEvent, emp: DtoUserResponse) {
  if (emp.id == null || !canEditEmployee(emp)) return
  openMenu({ x: e.clientX, y: e.clientY, employeeId: emp.id })
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openCreate() {
  openModal({ type: 'create' })
}

function openEdit(id: number) {
  const emp = employees.value.find((e) => e.id === id)
  if (emp) {
    openModal({
      type: 'edit',
      id,
      lastName: emp.last_name ?? '',
      firstName: emp.first_name ?? '',
      middleName: emp.middle_name ?? '',
      position: emp.position ?? '',
      managerId: emp.manager_id ?? null,
      hireDate: emp.hire_date,
      terminationDate: emp.termination_date,
    })
  }
}

function handleSelect(id: string) {
  if (!menu.value) return
  if (id === 'edit-employee') {
    openEdit(menu.value.employeeId)
  } else if (id === 'delete-employee') {
    const employeeId = menu.value.employeeId
    ask('Удалить сотрудника?', () => {
      void ts.deleteEmployee(employeeId)
    })
  }
}

onMounted(async () => {
  if (!employees.value.length) await ts.fetchEmployees()
  if (isAdmin.value && !users.value.length) await app.loadUsers()
})
</script>

<template>
  <section class="ep">
    <div class="ep-head">
      <h2 class="ep-title">Сотрудники</h2>
      <div class="ep-actions">
        <input v-model="search" type="search" class="ep-search" placeholder="Поиск по ФИО или должности" />
        <select v-if="isAdmin" v-model="managerFilter" class="ep-filter">
          <option value="">Все руководители</option>
          <option value="none">Без руководителя</option>
          <option v-for="u in users.filter((u) => u.role !== 'worker').sort(compareByName)" :key="u.id" :value="u.id">{{ u.name ?? `#${u.id}` }}</option>
        </select>
        <button v-if="canManageEmployees" type="button" class="ep-add" @click="openCreate">Создать сотрудника</button>
      </div>
    </div>

    <p v-if="loading && !employees.length" class="ep-st">Загрузка...</p>
    <p v-if="error && !employees.length" class="ep-st er">{{ error }}</p>

    <div v-if="filteredEmployees.length" class="table">
      <div class="tr th">
        <div>ФИО</div>
        <div>Должность</div>
        <div>Дата приёма</div>
        <div>Дата увольнения</div>
        <div>Руководитель</div>
      </div>
      <div
        v-for="emp in filteredEmployees"
        :key="emp.id"
        class="tr"
        @contextmenu.prevent.stop="onRowContextMenu($event, emp)"
      >
        <div class="name">{{ emp.name }}</div>
        <div>{{ emp.position || '—' }}</div>
        <div>{{ fmtDate(emp.hire_date) }}</div>
        <div>{{ fmtDate(emp.termination_date) }}</div>
        <div>{{ managerLabel(emp.manager_id) }}</div>
      </div>
    </div>
    <p v-else-if="!loading && !error && employees.length" class="ep-st">Ничего не найдено</p>
    <p v-else-if="!loading && !error" class="ep-st">Нет данных о сотрудниках</p>

    <ContextMenu v-bind="menuBind" @select="select" @close="closeMenu" />

    <ConfirmDialog
      :open="!!confirmDialog"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      @confirm="proceed"
      @close="cancel"
    />

    <ModalForm v-bind="modalBind" @save="submitModal" @close="closeModal" />
  </section>
</template>

<style scoped>
.ep-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.ep-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
}
.ep-add {
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #1a73e8;
  color: #fff;
  transition: background 0.15s;
}
.ep-add:hover {
  background: #1765cc;
}
.ep-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ep-search {
  width: 240px;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-search:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.ep-filter {
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ep-filter:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.ep-st {
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: #d93025; }

.table {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: 1.4fr 1.3fr 110px 140px 1fr;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}
.tr:last-child { border-bottom: none; }
.tr:not(.th):hover {
  background: #f6f8fa;
}
.th {
  background: #f8f9fa;
  font-weight: 600;
  color: #555;
}
.name {
  font-weight: 700;
  color: #1a3a6b;
}
</style>
