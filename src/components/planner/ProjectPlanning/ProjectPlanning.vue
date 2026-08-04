<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import ProjectGantt from './components/ProjectGantt/ProjectGantt.vue'
import type { ProjectGanttItem } from './components/ProjectGantt/types'
import type { DtoProject, DtoUserInfo } from '@/api'
import type { PlanningMode, PlanningUnit } from '../calendar'
import { buildCells, toDate } from '../calendar'
import { LABEL_WIDTH, CELL_WIDTH } from '../layout'

const props = withDefaults(defineProps<{
  projects?: DtoProject[] | null
  loading?: boolean
  error?: string | null
  /** Пользователи для отображения владельца (owner_id → name) в тултипах */
  users?: DtoUserInfo[] | null
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

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string; rowIndex: number; projectId?: number }]
  reorder: [payload: { from: number; to: number }]
  edit: [payload: number]
}>()

const userNames = computed(() => new Map((props.users || []).map((u) => [u.id, u.name])))

const projects = computed<ProjectGanttItem[]>(() =>
  (props.projects || []).map((dto) => ({
    id: dto.id ?? 0,
    project_code: dto.project_code ?? '',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    priority: dto.priority,
    owner_name: dto.owner_id != null ? userNames.value.get(dto.owner_id) : undefined,
  })),
)

// Отправная точка календаря по умолчанию — текущая дата (прошлое отсекается слева)
const defaultAnchor = computed<Date>(() => new Date())

const anchor = computed<Date>(() => {
  if (props.anchor == null) return defaultAnchor.value
  return toDate(props.anchor)
})

// Ячейки календаря фиксированной длины в зависимости от периода и единицы
const cells = computed(() => buildCells(anchor.value, props.mode, props.unit))

const gridCols = computed(() => {
  if (!cells.value.length) return `${LABEL_WIDTH}px`
  return `${LABEL_WIDTH}px repeat(${cells.value.length}, var(--cell-width, ${CELL_WIDTH}px))`
})
</script>

<template>
  <div class="pg">
    <template v-if="loading">
      <div class="st">Загрузка...</div>
    </template>
    <template v-else>
      <p v-if="error" class="pg-error">{{ error }}</p>
      <template v-if="projects.length && cells.length">
        <div class="gg" :style="{ gridTemplateColumns: gridCols }">

          <CalendarHeader :anchor="anchor" :mode="mode" :unit="unit" />

          <div class="sep" style="gridColumn:1/-1"></div>

          <ProjectGantt
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
            :projects="projects"
            @change="(p) => emit('change', p)"
            @contextmenu="(p) => emit('contextmenu', p)"
            @reorder="(p) => emit('reorder', p)"
            @edit="(id) => emit('edit', id)"
          />
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
  box-shadow: 0 1px 6px rgba(0,0,0,.08); overflow-x: auto;
}
.st { text-align:center; padding:30px; color:#666; font-size:14px; }
.pg-error { color:#d93025; font-size:13px; padding:8px 4px; }
.gg { display: grid; min-width: 600px; }
.sep { border: none; border-bottom: 2px solid #1a73e8; margin: 4px 0; height: 0; }
</style>
