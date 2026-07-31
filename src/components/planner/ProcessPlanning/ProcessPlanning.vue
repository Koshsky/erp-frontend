<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import ProcessGantt from './components/ProcessGantt/ProcessGantt.vue'
import type { DtoDetailedProject } from '@/api'
import type { ProcessPlanningProject } from './types'

const props = defineProps<{
  projects?: DtoDetailedProject[] | null
  loading?: boolean
  error?: string | null
}>()

// Маппим DTO (из /planning/processes) во внутренний тип планировщика.
const displayProjects = computed<ProcessPlanningProject[]>(() =>
  (props.projects || []).map((dto) => ({
    id: dto.id ?? 0,
    project_code: dto.project_code ?? '',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    processes: (dto.processes || []).map((p) => ({
      id: p.id ?? 0,
      title: p.title ?? '',
      start_date: p.start_date ?? '',
      end_date: p.end_date ?? '',
    })),
  })),
)

const dayList = computed(() => {
  if (!displayProjects.value.length) return []
  let min = Infinity, max = -Infinity
  for (const project of displayProjects.value) {
    const ts = new Date(project.start_date).getTime()
    const te = new Date(project.end_date).getTime()
    if (ts < min) min = ts
    if (te > max) max = te
  }
  if (!isFinite(min) || !isFinite(max)) return []
  const days: Date[] = []
  const cur = new Date(min)
  const end = new Date(max)
  while (cur <= end) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
})

const gridCols = computed(() => {
  if (!dayList.value.length) return '180px'
  return `180px repeat(${dayList.value.length}, 1fr)`
})

const dayZero = computed<Date | null>(() => dayList.value.length ? dayList.value[0] : null)
</script>

<template>
  <div class="pg">
    <div v-if="loading" class="st">Загрузка...</div>
    <div v-else-if="error" class="st er">{{ error }}</div>
    <template v-else-if="displayProjects.length && dayList.length">
      <div class="gg" :style="{ gridTemplateColumns: gridCols }">

        <CalendarHeader :startDate="dayList[0]" :endDate="dayList[dayList.length-1]" />

        <div class="sep" style="gridColumn:1/-1"></div>

        <template v-for="project in displayProjects" :key="'proj'+project.id">
          <ProcessGantt
            :dayZero="dayZero"
            :totalDays="dayList.length"
            :projectCode="project.project_code"
            :processes="project.processes"
            :groupStartDate="project.start_date"
            :groupEndDate="project.end_date"
          />
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
.er { color:#d93025; }
.gg { display: grid; min-width: 600px; }
.sep { border: none; border-bottom: 2px solid #1a73e8; margin: 4px 0; height: 0; }
</style>
