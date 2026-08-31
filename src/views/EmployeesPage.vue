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
import type { DtoResourceResponse, DtoUserResponse } from '@/api'

const ts = useTimesheetStore()
const { employees, employeesWithTitles, loading, error } = storeToRefs(ts)

const app = useAppStore()
const { users } = storeToRefs(app)
const { resources, resourcesError } = storeToRefs(app)

// Edit/delete: admin can edit anyone, others (vp) — only their subordinates.
// Creating employees — admin only (worker.create; vp has no such permission).
const { role, userId, canCreateEmployee, canEditEmployee } = useRoleAccess()
const isAdmin = computed(() => role.value === 'admin')

/**
 * Employee resource (membership is unique: UNIQUE(user_id)) — for the badge,
 * filter, and resource change when editing.
 */
function resourceOf(employeeId: number | undefined): DtoResourceResponse | null {
  if (employeeId == null) return null
  return app.resourceByUser[employeeId] ?? null
}

/** Sort resources by code/title (resources have no name field) */
const byResourceLabel = (a: DtoResourceResponse, b: DtoResourceResponse): number =>
  `${a.code ?? ''} ${a.title ?? ''}`.localeCompare(`${b.code ?? ''} ${b.title ?? ''}`, 'ru')

/** Resources the user can manage (admin — all, others — their own) */
const manageableResources = computed<DtoResourceResponse[]>(() =>
  resources.value.filter((r) => isAdmin.value || r.owner_id === userId.value).sort(byResourceLabel),
)

/** All resources (for the filter select), sorted by code/title */
const resourcesSorted = computed<DtoResourceResponse[]>(() => [...resources.value].sort(byResourceLabel))

/** Date as DD.MM.YYYY or «—» */
function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Label of the employee's manager */
function managerLabel(managerId?: number | null): string {
  if (managerId == null) return '—'
  if (managerId === userId.value) return 'Я'
  const u = users.value.find((x) => x.id === managerId)
  return u?.name ?? `#${managerId}`
}

/** Search by full name and position (case-insensitive) */
const search = ref('')

/** Filter by manager (manager_id): '' — all, 'none' — no manager (client-side), number — server-side filter */
const managerFilter = ref<number | 'none' | ''>('')

/** Filter by resource: '' — all, 'none' — no resource, number — a resource */
const resourceFilter = ref<number | 'none' | ''>('')

const filteredEmployees = computed(() => {
  let list = employeesWithTitles.value
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter((e) => `${e.name ?? ''} ${e.position ?? ''}`.toLowerCase().includes(q))
  }
  // 'none' (no manager) is filtered on the client; numeric manager_id is already filtered by the server
  if (managerFilter.value === 'none') {
    list = list.filter((e) => e.manager_id == null)
  }
  if (resourceFilter.value === 'none') {
    list = list.filter((e) => e.id != null && !app.resourceByUser[e.id])
  } else if (typeof resourceFilter.value === 'number') {
    list = list.filter((e) => e.id != null && app.resourceByUser[e.id]?.id === resourceFilter.value)
  }
  return list
})

// Changing the manager filter reloads the listing with manager_id (admin only)
watch(managerFilter, (v) => {
  if (isAdmin.value) ts.fetchEmployees(typeof v === 'number' ? v : undefined)
})

// Right-click on a row: edit/delete (own employees only / admin)
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

// Delete confirmation dialog
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
      resourceId?: number | null
    }

/** Manager options (users, excluding workers) + the "No manager" option */
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
    // Manager is chosen by admin only (creating employees is admin-only)
    if (isAdmin.value) {
      fields.push({
        key: 'managerId',
        label: 'Руководитель',
        type: 'select',
        options: managerOptions.value,
        value: state.type === 'edit' ? (state.managerId ?? '') : '',
      })
    }
    // Resource is changed only when editing and only by those who can manage it
    if (state.type === 'edit' && manageableResources.value.length) {
      fields.push({
        key: 'resourceId',
        label: 'Ресурс',
        type: 'select',
        options: [
          { value: '', label: 'Без ресурса' },
          ...manageableResources.value.map((r) => ({
            value: r.id as number,
            label: `${r.code} — ${r.title}`,
          })),
        ],
        value: state.type === 'edit' ? (state.resourceId != null ? state.resourceId : '') : '',
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
    // Send the manager only for admin and only when explicitly chosen (otherwise — unchanged)
    if (isAdmin.value && values.managerId !== '' && values.managerId != null) {
      payload.manager_id = Number(values.managerId)
    }
    const ok =
      state.type === 'create'
        ? await ts.createEmployee({ ...payload, role: 'worker' })
        : await ts.updateEmployee(state.id, payload)
    // Changing the employee's resource (only on edit and when it actually changed)
    let resourceOk = true
    let resourceError: string | null = null
    if (state.type === 'edit' && ok) {
      const toResourceId = values.resourceId === '' || values.resourceId == null ? null : Number(values.resourceId)
      const fromResourceId = state.resourceId ?? null
      if (fromResourceId !== toResourceId) {
        resourceOk = await app.changeEmployeeResource(state.id, fromResourceId, toResourceId)
        if (!resourceOk) {
          resourceError = app.resourcesError ?? 'Не удалось изменить ресурс сотрудника'
        }
      }
    }
    if (!ok) return { ok, error: error.value }
    if (!resourceOk) return { ok: false, error: resourceError }
    return { ok: true, error: null }
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
      resourceId: resourceOf(emp.id)?.id ?? null,
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
  // Load resources and their members unconditionally: resources are often already in the store
  // (dashboard/planner load them earlier), but members — only here;
  // a gate on resources.length would leave everyone "without a resource" without badges.
  await app.ensureResourceMembers(true)
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
        <select v-if="resources.length" v-model="resourceFilter" class="ep-filter" title="Фильтр по ресурсу">
          <option value="">Все ресурсы</option>
          <option value="none">Без ресурса</option>
          <option v-for="r in resourcesSorted" :key="r.id" :value="r.id">{{ r.code }} — {{ r.title }}</option>
        </select>
        <button v-if="canCreateEmployee" type="button" class="ep-add" @click="openCreate">Создать сотрудника</button>
      </div>
    </div>

    <p v-if="loading && !employees.length" class="ep-st">Загрузка...</p>
    <p v-if="error && !employees.length" class="ep-st er">{{ error }}</p>
    <p v-if="resourcesError" class="ep-st er">{{ resourcesError }}</p>

    <!--
      The table frame (header included) stays visible even when the filters
      leave no rows: the empty-state message is rendered inside the table
      instead of replacing it, so the header and filter controls remain usable.
    -->
    <div v-if="employees.length || (!loading && !error)" class="table">
      <div class="tr th">
        <div>ФИО</div>
        <div>Должность</div>
        <div>Дата приёма</div>
        <div>Дата увольнения</div>
        <div>Руководитель</div>
      </div>
      <template v-if="filteredEmployees.length">
        <div
          v-for="emp in filteredEmployees"
          :key="emp.id"
          class="tr"
          @contextmenu.prevent.stop="onRowContextMenu($event, emp)"
        >
          <div class="name-cell">
            <span class="name">{{ emp.name }}</span>
            <span v-if="resourceOf(emp.id)" class="ep-badge" :title="resourceOf(emp.id)?.title">
              {{ resourceOf(emp.id)?.code }}
            </span>
          </div>
          <div>{{ emp.position || '—' }}</div>
          <div>{{ fmtDate(emp.hire_date) }}</div>
          <div>{{ fmtDate(emp.termination_date) }}</div>
          <div>{{ managerLabel(emp.manager_id) }}</div>
        </div>
      </template>
      <p v-else class="ep-st">{{ employees.length ? 'Ничего не найдено' : 'Нет данных о сотрудниках' }}</p>
    </div>

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
@import '../styles/tokens.css';

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
  color: var(--ui-text);
}
.ep-add {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  transition: background var(--ui-duration);
}
.ep-add:hover {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.ep-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ep-search {
  width: 240px;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}
.ep-search:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.ep-filter {
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}
.ep-filter:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.ep-st {
  color: var(--ui-text-2);
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: var(--ui-danger); }

.table {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: 1.4fr 1.3fr 110px 140px 1fr;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--ui-border);
  font-size: 14px;
}
.tr:last-child { border-bottom: none; }
.tr:not(.th):hover {
  background: var(--ui-surface-3);
}
.th {
  background: var(--ui-surface-2);
  font-weight: 600;
  color: var(--ui-text-2);
}
.name {
  font-weight: 700;
  color: var(--ui-text);
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ep-badge {
  flex: none;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  border: 1px solid color-mix(in srgb, var(--ui-accent) 25%, transparent);
}
</style>
