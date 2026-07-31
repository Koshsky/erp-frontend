<script setup lang="ts">
import { ref, computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import ProjectBar from './components/ProjectBar/ProjectBar.vue'
import type { ProjectItem, PlanningPeriod } from './types'

const props = withDefaults(defineProps<{
  projects?: ProjectItem[] | null
  period?: PlanningPeriod
}>(), {
  period: 'quarter',
})

const projects = ref<ProjectItem[]>(props.projects || [])

// Длина (в днях) для каждого периода
const PERIOD_DAYS: Record<PlanningPeriod, number> = {
  quarter: 92, // ~3 месяца
  half: 183,   // ~полгода
  year: 365,   // год
}

// Отправная точка календаря — самый ранний старт проекта (или текущая дата)
const calendarStart = computed<Date>(() => {
  let min = Infinity
  for (const p of projects.value) {
    const ts = new Date(p.start_date).getTime()
    if (ts < min) min = ts
  }
  if (!isFinite(min)) return new Date()
  return new Date(min)
})

// Календарь фиксированной длины в зависимости от выбранного периода
const dayList = computed<Date[]>(() => {
  const days = PERIOD_DAYS[props.period]
  const list: Date[] = []
  const cur = new Date(calendarStart.value)
  for (let i = 0; i < days; i++) {
    list.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return list
})

const gridCols = computed(() => {
  if (!dayList.value.length) return '180px'
  return `180px repeat(${dayList.value.length}, 1fr)`
})

const dayZero = computed<Date | null>(() => dayList.value.length ? dayList.value[0] : null)
</script>

<template>
  <div class="pg">
    <template v-if="projects.length && dayList.length">
      <div class="gg" :style="{ gridTemplateColumns: gridCols }">

        <CalendarHeader :startDate="dayList[0]" :endDate="dayList[dayList.length-1]" />

        <div class="sep" style="gridColumn:1/-1"></div>

        <template v-for="project in projects" :key="'proj'+project.id">
          <div class="c lc ph">
            <span class="ph-code">{{ project.project_code }}</span>
          </div>
          <div class="bar-cell" style="gridColumn:2/-1">
            <ProjectBar
              :dayZero="dayZero!"
              :totalDays="dayList.length"
              :startDate="project.start_date"
              :endDate="project.end_date"
              :projectCode="project.project_code"
            />
          </div>
        </template>
      </div>
    </template>

    <div v-else class="st">Нет данных</div>
  </div>
</template>

<style scoped>
.pg {
  background: #fff; border-radius: 10px; padding: 12px;
  box-shadow: 0 1px 6px rgba(0,0,0,.08); overflow-x: auto;
}
.st { text-align:center; padding:30px; color:#666; font-size:14px; }
.gg { display: grid; min-width: 600px; }
.sep { border: none; border-bottom: 2px solid #1a73e8; margin: 4px 0; height: 0; }

.c {
  border: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  font-size: 12px;
}
.lc {
  position: sticky; left: 0; background: #fff; z-index: 2;
  text-align: left; padding: 4px 8px !important;
  border-left: none; overflow: hidden;
}
.ph {
  min-height: 32px;
  background: #f0f7ff;
  font-weight: 700; font-size: 13px; color: #1a73e8;
}
.ph-code {
  font-size: 12px;
  color: #1a73e8;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.bar-cell {
  position: relative; min-height: 36px;
  border: 1px solid #e8e8e8; border-top: none; background: #fff;
}
</style>

