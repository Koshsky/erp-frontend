<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import ResourceHeader from './components/ResourceHeader/ResourceHeader.vue'
import TaskGantt from './components/TaskGantt/TaskGantt.vue'
import type { DtoDetailedProcess, DtoResource } from '@/api'
import type { Resource } from './components/ResourceHeader/types'
import type { Process } from './types'
import { buildCells, toDate } from '../calendar'
import { LABEL_WIDTH, CELL_WIDTH } from '../layout'
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

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  'milestone-change': [payload: { id: number; date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }]
  'task-edit': [payload: number]
  'milestone-edit': [payload: number]
}>()

// Маппим DTO (из /planning/tasks) во внутренние типы планировщика.
// Задачи внутри процесса сортируем по алфавиту.
const displayProcesses = computed<Process[]>(() =>
  (props.processes || []).map((dto) => ({
    id: dto.id ?? 0,
    title: dto.title ?? '',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    project_code: '',
    tasks: [...(dto.tasks || [])]
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'))
      .map((t) => ({
        id: t.id ?? 0,
        title: t.title ?? '',
        start_date: t.start_date ?? '',
        end_date: t.end_date ?? '',
        resources: (t.resources || []).map((r) => ({
          resource_id: r.id ?? 0,
          assignment_id: r.assignment_id ?? 0,
          quantity: r.quantity ?? 0,
          code: r.code ?? '',
          title: r.title ?? '',
        })),
      })),
    milestones: (dto.milestones || []).map((m) => ({
      id: m.id ?? 0,
      title: m.title ?? '',
      content: m.content,
      date: m.date ?? '',
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

/** Якорь по умолчанию — текущая дата: прошлое отсекается слева (архив) */
const defaultAnchor = computed<Date>(() => new Date())

const anchor = computed<Date>(() => {
  if (props.anchor == null) return defaultAnchor.value
  return toDate(props.anchor)
})

const cells = computed(() => buildCells(anchor.value, props.mode, props.unit))

function usageForDay(resourceId: number, day: Date): number {
  let used = 0
  for (const proc of displayProcesses.value) {
    if (!proc.tasks) continue
    for (const t of proc.tasks) {
      const d = day.getTime()
      // start_date и end_date включительно (локальные даты, как у баров)
      if (d < toDate(t.start_date).getTime() || d > toDate(t.end_date).getTime()) continue
      const a = (t.resources || []).find((r) => r.resource_id === resourceId)
      if (a) used += a.quantity
    }
  }
  return used
}

const gridCols = computed(() => {
  if (!cells.value.length) return LABEL_WIDTH + 'px'
  return `${LABEL_WIDTH}px repeat(${cells.value.length}, var(--cell-width, ${CELL_WIDTH}px))`
})
</script>

<template>
  <div class="pg">
    <div v-if="loading" class="st">Загрузка...</div>
    <template v-else>
      <p v-if="error" class="pg-error">{{ error }}</p>

      <template v-if="displayProcesses.length && cells.length">
        <div class="pg-scroll">
          <div class="gg" :style="{ gridTemplateColumns: gridCols }">

            <div class="gg-head" :style="{ gridTemplateColumns: gridCols }">
              <CalendarHeader :anchor="anchor" :mode="mode" :unit="unit" />

              <ResourceHeader
                :anchor="anchor"
                :mode="mode"
                :unit="unit"
                :resources="displayResources"
                :usageFn="usageForDay"
              />

              <div class="sep" style="gridColumn:1/-1"></div>
            </div>

            <template v-for="proc in displayProcesses" :key="'proc'+proc.id">
              <TaskGantt
                :anchor="anchor"
                :mode="mode"
                :unit="unit"
                :title="proc.title"
                :projectCode="proc.project_code"
                :processId="proc.id"
                :tasks="proc.tasks || []"
                :milestones="proc.milestones || []"
                :groupStartDate="proc.start_date"
                :groupEndDate="proc.end_date"
                @change="(p) => emit('change', p)"
                @milestone-change="(p) => emit('milestone-change', p)"
                @contextmenu="(p) => emit('contextmenu', p)"
                @task-edit="(id) => emit('task-edit', id)"
                @milestone-edit="(id) => emit('milestone-edit', id)"
              />
            </template>
          </div>
        </div>
      </template>

      <div v-else-if="error" class="st er">{{ error }}</div>
      <div v-else class="st">Нет данных</div>
    </template>
  </div>
</template>

<style scoped>
.pg {
  background: #fff; border-radius: 10px; padding: 12px;
  box-shadow: 0 1px 6px rgba(0,0,0,.08);
}
.pg-scroll { overflow: auto; max-height: var(--planner-max-height, calc(100vh - 160px)); }
.st { text-align:center; padding:30px; color:#666; font-size:14px; }
.pg-error { color:#d93025; font-size:13px; padding:8px 4px; }
.er { color:#d93025; }
.gg { display: grid; min-width: 600px; }
.gg-head {
  grid-column: 1 / -1;
  display: grid;
  position: sticky;
  top: 0;
  z-index: 20;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,.06);
}
.sep { border: none; border-bottom: 2px solid #1a73e8; margin: 4px 0; height: 0; }
</style>
