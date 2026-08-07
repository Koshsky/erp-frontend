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
import { useAuthStore, useTimesheetStore } from '../store'

const ts = useTimesheetStore()
const auth = useAuthStore()
const { employees, states, loading, busy, error } = storeToRefs(ts)

const unit = ref<PlanningUnit>('day')
const origin = ref(toDate(new Date()))

const isAdmin = computed(() => auth.user?.role === 'admin')

onMounted(async () => {
  await ts.loadStates()
  await ts.loadEmployees()
})

/** Дозагрузка состояний при прокрутке/зуме (с дебаунсом) */
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
      <span v-if="isAdmin" class="tp-note">Все сотрудники</span>
    </div>

    <PlannerStates :loading="loading" :error="null" :has-data="employees.length > 0">
      <TimelineGrid
        v-if="employees.length"
        id="timesheet"
        :origin="origin"
        :unit="unit"
        :focus-date="null"
      >
        <template #default="{ t }">
          <CalendarHeader :t="t" />
          <TimesheetGrid
            :t="t"
            :employees="employees"
            :states="states"
            :state-for-day="(id, iso) => ts.periodFor(id, iso)"
            :busy="busy"
            @assign="onAssign"
            @clear="onClear"
            @range="onRange"
          />
        </template>
      </TimelineGrid>
    </PlannerStates>

    <p v-if="error" class="tp-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.tp-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.tp-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
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
  color: #555;
}
.tp-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}
.tp-note {
  margin-left: auto;
  font-size: 12px;
  color: #888;
}
.tp-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: #d93025;
}
</style>
