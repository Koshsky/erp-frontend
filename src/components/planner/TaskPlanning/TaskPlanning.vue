<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import ResourceHeader from './components/ResourceHeader/ResourceHeader.vue'
import TaskGantt from './components/TaskGantt/TaskGantt.vue'
import type { DtoDetailedProcess, DtoResource } from '@/api'
import type { Resource } from './components/ResourceHeader/types'
import type { Process } from './types'
import { buildCells } from '../calendar'
import type { PlanningMode, PlanningUnit } from '../calendar'

const props = withDefaults(defineProps<{
  processes?: DtoDetailedProcess[] | null
  resources?: DtoResource[] | null
  loading?: boolean
  error?: string | null
  /** Якорь шкалы (первая ячейка); по умолчанию — самая ранняя дата старта процесса */
  anchor?: string | Date | number | null
  /** Период календаря: квартал, полугодие или год */
  mode?: PlanningMode
  /** Единица ячейки: день, неделя или декада */
  unit?: PlanningUnit
}>(), {
  mode: 'quarter',
  unit: 'day',
})

// Маппим DTO (из /planning/tasks) во внутренние типы планировщика.
const displayProcesses = computed<Process[]>(() =>
  (props.processes || []).map((dto) => ({
    id: dto.id ?? 0,
    title: dto.title ?? '',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    project_code: '',
    tasks: (dto.tasks || []).map((t) => ({
      id: t.id ?? 0,
      title: t.title ?? '',
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      resources: (t.resources || []).map((r) => ({
        resource_id: r.id ?? 0,
        quantity: r.quantity ?? 0,
        code: r.code ?? '',
      })),
    })),
  })),
)

const displayResources = computed<Resource[]>(() =>
  (props.resources || []).map((r) => ({
    id: r.id ?? 0,
    code: r.code ?? '',
    title: r.title ?? '',
    quantity: r.quantity ?? 0,
  })),
)

/** Якорь по умолчанию — самая ранняя дата старта среди процессов */
const defaultAnchor = computed<Date>(() => {
  let min = Infinity
  for (const proc of displayProcesses.value) {
    const ts = new Date(proc.start_date).getTime()
    if (ts < min) min = ts
  }
  return isFinite(min) ? new Date(min) : new Date()
})

const anchor = computed<Date>(() => {
  if (props.anchor == null) return defaultAnchor.value
  return props.anchor instanceof Date ? props.anchor : new Date(props.anchor)
})

const cells = computed(() => buildCells(anchor.value, props.mode, props.unit))

function usageForDay(resourceId: number, day: Date): number {
  let used = 0
  for (const proc of displayProcesses.value) {
    if (!proc.tasks) continue
    for (const t of proc.tasks) {
      const d = day.getTime()
      if (d < new Date(t.start_date).getTime() || d >= new Date(t.end_date).getTime()) continue
      const a = (t.resources || []).find((r) => r.resource_id === resourceId)
      if (a) used += a.quantity
    }
  }
  return used
}

const gridCols = computed(() => {
  if (!cells.value.length) return '180px'
  return `180px repeat(${cells.value.length}, 1fr)`
})
</script>

<template>
  <div class="pg">
    <div v-if="loading" class="st">Загрузка...</div>
    <div v-else-if="error" class="st er">{{ error }}</div>

    <template v-else-if="displayProcesses.length && cells.length">
      <div class="gg" :style="{ gridTemplateColumns: gridCols }">

        <CalendarHeader :anchor="anchor" :mode="mode" :unit="unit" />

        <ResourceHeader
          :anchor="anchor"
          :mode="mode"
          :unit="unit"
          :resources="displayResources"
          :usageFn="usageForDay"
        />

        <div class="sep" style="gridColumn:1/-1"></div>

        <template v-for="proc in displayProcesses" :key="'proc'+proc.id">
          <TaskGantt
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
            :title="proc.title"
            :projectCode="proc.project_code"
            :tasks="proc.tasks || []"
            :groupStartDate="proc.start_date"
            :groupEndDate="proc.end_date"
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
