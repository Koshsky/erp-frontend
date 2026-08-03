<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import ProcessGantt from './components/ProcessGantt/ProcessGantt.vue'
import type { DtoDetailedProject } from '@/api'
import type { ProcessPlanningProject } from './types'
import { buildCells } from '../calendar'
import type { PlanningMode, PlanningUnit } from '../calendar'

const props = withDefaults(defineProps<{
  projects?: DtoDetailedProject[] | null
  loading?: boolean
  error?: string | null
  /** Якорь шкалы (первая ячейка); по умолчанию — самая ранняя дата старта проекта */
  anchor?: string | Date | number | null
  /** Период календаря: квартал, полугодие или год */
  mode?: PlanningMode
  /** Единица ячейки: день, неделя или декада */
  unit?: PlanningUnit
}>(), {
  mode: 'quarter',
  unit: 'day',
})

// Маппим DTO (из /planning/processes) во внутренний тип планировщика.
const displayProjects = computed<ProcessPlanningProject[]>(() =>
  (props.projects || []).map((dto) => ({
    id: dto.id ?? 0,
    project_code: dto.project_code ?? '',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    owner_id: dto.owner_id,
    priority: dto.priority,
    processes: (dto.processes || []).map((p) => ({
      id: p.id ?? 0,
      title: p.title ?? '',
      start_date: p.start_date ?? '',
      end_date: p.end_date ?? '',
      owner_id: p.owner_id,
      project_id: p.project_id,
    })),
  })),
)

/** Якорь по умолчанию — самая ранняя дата старта среди проектов */
const defaultAnchor = computed<Date>(() => {
  let min = Infinity
  for (const project of displayProjects.value) {
    const ts = new Date(project.start_date).getTime()
    if (ts < min) min = ts
  }
  return isFinite(min) ? new Date(min) : new Date()
})

const anchor = computed<Date>(() => {
  if (props.anchor == null) return defaultAnchor.value
  return props.anchor instanceof Date ? props.anchor : new Date(props.anchor)
})

const cells = computed(() => buildCells(anchor.value, props.mode, props.unit))

const gridCols = computed(() => {
  if (!cells.value.length) return '180px'
  return `180px repeat(${cells.value.length}, 1fr)`
})
</script>

<template>
  <div class="pg">
    <div v-if="loading" class="st">Загрузка...</div>
    <div v-else-if="error" class="st er">{{ error }}</div>
    <template v-else-if="displayProjects.length && cells.length">
      <div class="gg" :style="{ gridTemplateColumns: gridCols }">

        <CalendarHeader :anchor="anchor" :mode="mode" :unit="unit" />

        <div class="sep" style="gridColumn:1/-1"></div>

        <template v-for="project in displayProjects" :key="'proj'+project.id">
          <ProcessGantt
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
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
