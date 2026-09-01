<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import CalendarHeader from '../components/planner/CalendarHeader/CalendarHeader.vue'
import TimelineGrid from '../components/planner/TimelineGrid/TimelineGrid.vue'
import { PlannerStates } from '../components/common'
import { TimesheetGrid, stateBackground } from '../components/timesheet'
import type { AssignPayload, ClearPayload } from '../components/timesheet'
import { toDate } from '../components/planner/calendar'
import type { PlanningUnit } from '../components/planner/calendar'
import { useEmployeeFilters } from '../composables/useEmployeeFilters'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useAppStore, useAuthStore, useRbacStore, useTimesheetStore } from '../store'

const ts = useTimesheetStore()
const auth = useAuthStore()
const { timesheetRows, states, loading, busy, error } = storeToRefs(ts)

const unit = ref<PlanningUnit>('day')
const origin = ref(toDate(new Date()))

const rbac = useRbacStore()
/** "All employees" — when worker visibility is not restricted (scope all). */
const seesAllEmployees = computed(() => rbac.perm('worker', 'view') === 'all')

const app = useAppStore()
const { users, resources } = storeToRefs(app)

const { role, canAssignEmployeeDays, canClearEmployeeDays } = useRoleAccess()
const isAdmin = computed(() => role.value === 'admin')

/** Resolve an employee row by id (for per-row permission predicates) */
function employeeById(id: number) {
  return visibleRows.value.find((e) => e.id === id)
}

/**
 * Shared employee filters (search / manager / resource) — synchronized with the
 * "Employees" page: the state is a single module-level source of truth.
 */
const {
  search,
  managerFilter,
  resourceFilter,
  managerFilterOptions,
  resourceFilterOptions,
  applyFilters,
} = useEmployeeFilters()

/** Rows shown in the grid: the roster filtered by the shared filters. */
const visibleRows = computed(() => applyFilters(timesheetRows.value))

onMounted(async () => {
  await ts.loadStates()
  await ts.loadEmployees()
  // The filter options need the user/resource catalogs (cached in the app store)
  if (isAdmin.value && !users.value.length) await app.loadUsers()
  await app.ensureResourceMembers(false)
})

/** Lazy-load states on scroll/zoom (debounced) */
let rangeTimer: number | null = null
function onRange(p: { startDate: string; endDate: string }) {
  if (rangeTimer != null) clearTimeout(rangeTimer)
  rangeTimer = window.setTimeout(() => void ts.ensureRange(p.startDate, p.endDate), 250)
}
onBeforeUnmount(() => {
  if (rangeTimer != null) clearTimeout(rangeTimer)
})

async function onAssign(p: AssignPayload) {
  await ts.assignRange(p.employeeId, p.stateId, p.startDate, p.endDate)
}

async function onClear(p: ClearPayload) {
  await ts.clearRange(p.employeeId, p.startDate, p.endDate)
}
</script>

<template>
  <section class="tp">
    <div class="tp-head">
      <h2 class="tp-title">Табель</h2>
      <div class="tp-legend">
        <span v-for="st in states" :key="'lg' + st.id" class="tp-legend-item">
          <span
            class="tp-swatch"
            :style="{ background: stateBackground(st.code, st.is_available, st.id) }"
          />
          {{ st.name }}
        </span>
      </div>
      <span v-if="seesAllEmployees" class="tp-note">Все сотрудники</span>
    </div>

    <div class="tp-filters">
      <input v-model="search" type="search" class="tp-search" placeholder="Поиск по ФИО или должности" />
      <select v-if="isAdmin" v-model="managerFilter" class="tp-filter">
        <option value="">Все руководители</option>
        <option value="none">Без руководителя</option>
        <option v-for="u in managerFilterOptions" :key="u.id" :value="u.id">{{ u.name ?? `#${u.id}` }}</option>
      </select>
      <select v-if="resources.length" v-model="resourceFilter" class="tp-filter" title="Фильтр по ресурсу">
        <option value="">Все ресурсы</option>
        <option value="none">Без ресурса</option>
        <option v-for="r in resourceFilterOptions" :key="r.id" :value="r.id">{{ r.code }} — {{ r.title }}</option>
      </select>
    </div>

    <PlannerStates :loading="loading" :error="null" :has-data="timesheetRows.length > 0 || (!loading && !error)">
      <TimelineGrid
        id="timesheet"
        :origin="origin"
        :unit="unit"
        :focus-date="null"
      >
        <template #default="{ t }">
          <CalendarHeader :t="t" />
          <!--
            Like on the "Employees" page: when the roster is empty, the calendar
            header stays visible and the message is rendered inside the table.
            The box is constrained to the visible window (t.gridLeft +
            viewportCells * cellPx — the coordinates of the visible day cells),
            so the text stays centered in the grid area right of the sticky
            label strip instead of sliding right along the wide timeline content.
          -->
          <TimesheetGrid
            v-if="timesheetRows.length && visibleRows.length"
            :t="t"
            :employees="visibleRows"
            :states="states"
            :state-for-day="(id, iso) => ts.periodFor(id, iso)"
            :busy="busy"
            :can-assign="(id) => canAssignEmployeeDays(employeeById(id)?.manager_id)"
            :can-clear="(id) => canClearEmployeeDays(employeeById(id)?.manager_id)"
            @assign="onAssign"
            @clear="onClear"
            @range="onRange"
          />
          <p
            v-else
            class="tp-empty"
            :style="{
              marginLeft: t.gridLeft + 'px',
              width: t.viewportCells * t.cellPx + 'px',
            }"
          >
            {{ timesheetRows.length ? 'Ничего не найдено' : 'Нет данных о сотрудниках' }}
          </p>
        </template>
      </TimelineGrid>
    </PlannerStates>

    <p v-if="error" class="tp-error">{{ error }}</p>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.tp-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.tp-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.tp-search {
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
.tp-search:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.tp-filter {
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
.tp-filter:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.tp-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
}
.tp-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}
.tp-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.tp-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--ui-border);
}
.tp-note {
  margin-left: auto;
  font-size: 12px;
  color: var(--ui-text-faint);
}
.tp-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--ui-danger);
}
.tp-empty {
  color: var(--ui-text-2);
  font-size: 14px;
  padding: 40px 12px;
  text-align: center;
  box-sizing: border-box;
}
</style>
