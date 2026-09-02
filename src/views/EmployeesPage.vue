<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ContextMenu, ModalForm } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useEmployeeFilters } from '../composables/useEmployeeFilters'
import { useAppStore, useTimesheetStore } from '../store'
import type { DtoResourceResponse, DtoUserResponse } from '@/api'

const ts = useTimesheetStore()
const { employees, employeesWithTitles, loading, error } = storeToRefs(ts)

const app = useAppStore()
const { users } = storeToRefs(app)
const { resources, resourcesError } = storeToRefs(app)

// Edit/delete are NOT available here: an employee IS a system user, so profile
// editing happens only on the admin "Пользователи" page (user-edit right).
// This page only changes the employee's resource.
const { role, userId } = useRoleAccess()
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

/**
 * Badge style of the employee's resource: the custom resource color (soft
 * tinted background) or null — the default accent tokens from CSS.
 */
function resourceBadgeStyle(res: DtoResourceResponse | null): Record<string, string> | null {
  if (!res?.color) return null
  return {
    background: `color-mix(in srgb, ${res.color} 15%, transparent)`,
    color: res.color,
    borderColor: `color-mix(in srgb, ${res.color} 30%, transparent)`,
  }
}

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

/**
 * Shared employee filters (search / manager / resource) — synchronized with the
 * "Timesheet" page: the state is a single module-level source of truth.
 */
const {
  search,
  managerFilter,
  resourceFilter,
  managerFilterOptions,
  resourceFilterOptions,
  applyFilters,
} = useEmployeeFilters()

const filteredEmployees = computed(() => applyFilters(employeesWithTitles.value))

// Right-click on a row: only the resource change. The employee's profile is a
// system user — editing it happens solely on the admin "Пользователи" page.
interface MenuState {
  x: number
  y: number
  employeeId: number
}
const menu = ref<MenuState | null>(null)
const menuItems = computed<ContextMenuItem[]>(() => [
  { id: 'change-resource', label: 'Изменить ресурс' },
])

type ModalMode = {
  type: 'resource'
  id: number
  resourceId?: number | null
}

/** The resource dialog: one select (manageable resources) + "No resource" */
const { open: openModal, close: closeModal, submit: submitModal, bind: modalBind } = useEditModal<ModalMode>(
  (state) => {
    const fields: ModalField[] = []
    // Only those who can manage a resource (admin — all, others — their own)
    // may change the employee's resource; the backend gates it the same way.
    if (manageableResources.value.length) {
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
        value: state.resourceId != null ? state.resourceId : '',
      })
    }
    return fields
  },
  async (state, values) => {
    const toResourceId = values.resourceId === '' || values.resourceId == null ? null : Number(values.resourceId)
    const ok = await app.changeEmployeeResource(state.id, state.resourceId ?? null, toResourceId)
    if (!ok) return { ok: false, error: app.resourcesError ?? 'Не удалось изменить ресурс сотрудника' }
    return { ok: true, error: null }
  },
  () => 'Изменить ресурс',
  () => 'Сохранить',
)

function onRowContextMenu(e: MouseEvent, emp: DtoUserResponse) {
  if (emp.id == null || !manageableResources.value.length) return
  openMenu({ x: e.clientX, y: e.clientY, employeeId: emp.id })
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openChangeResource(id: number) {
  const emp = employees.value.find((e) => e.id === id)
  if (emp) {
    openModal({
      type: 'resource',
      id,
      resourceId: resourceOf(emp.id)?.id ?? null,
    })
  }
}

function handleSelect(id: string) {
  if (!menu.value) return
  if (id === 'change-resource') {
    openChangeResource(menu.value.employeeId)
  }
}

onMounted(async () => {
  if (!employees.value.length) await ts.loadEmployees()
  if (isAdmin.value && !users.value.length) await app.loadUsers()
  // Load resources and their members unconditionally: resources are often already in the store
  // (dashboard/planner load them earlier), but members — only here;
  // a gate on resources.length would leave everyone "without a resource" without badges.
  // Local-first: hydrate from the cache (no network from the render path).
  await app.ensureResourceMembers(false)
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
          <option v-for="u in managerFilterOptions" :key="u.id" :value="u.id">{{ u.name ?? `#${u.id}` }}</option>
        </select>
        <select v-if="resources.length" v-model="resourceFilter" class="ep-filter" title="Фильтр по ресурсу">
          <option value="">Все ресурсы</option>
          <option value="none">Без ресурса</option>
          <option v-for="r in resourceFilterOptions" :key="r.id" :value="r.id">{{ r.code }} — {{ r.title }}</option>
        </select>
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
      <div class="tr th" :class="{ 'tr--no-manager': !isAdmin }">
        <div>ФИО</div>
        <div>Должность</div>
        <div>Дата приёма</div>
        <div>Дата увольнения</div>
        <div v-if="isAdmin">Руководитель</div>
      </div>
      <template v-if="filteredEmployees.length">
        <div
          v-for="emp in filteredEmployees"
          :key="emp.id"
          class="tr"
          :class="{ 'tr--no-manager': !isAdmin }"
          @contextmenu.prevent.stop="onRowContextMenu($event, emp)"
        >
          <div class="name">{{ emp.name }}</div>
          <div class="pos-cell">
            <span
              v-if="resourceOf(emp.id)"
              class="ep-badge"
              :style="resourceBadgeStyle(resourceOf(emp.id)) ?? undefined"
              :title="resourceOf(emp.id)?.title"
            >
              {{ resourceOf(emp.id)?.code }}
            </span>
            <span class="pos-text">{{ emp.position || '—' }}</span>
          </div>
          <div>{{ fmtDate(emp.hire_date) }}</div>
          <div>{{ fmtDate(emp.termination_date) }}</div>
          <div v-if="isAdmin">{{ managerLabel(emp.manager_id) }}</div>
        </div>
      </template>
      <p v-else class="ep-st">{{ employees.length ? 'Ничего не найдено' : 'Нет данных о сотрудниках' }}</p>
    </div>

    <ContextMenu v-bind="menuBind" @select="select" @close="closeMenu" />

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
/* Non-admin (sees only own employees): the "Руководитель" column is hidden */
.tr--no-manager {
  grid-template-columns: 1.4fr 1.3fr 110px 140px;
}
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
.pos-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.pos-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-badge {
  flex: none;
  /* A uniform badge width so the position text starts at the same x
     in every row regardless of the code length */
  min-width: 56px;
  text-align: center;
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
