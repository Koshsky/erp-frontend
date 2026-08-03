<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import ProjectBar from './components/ProjectBar/ProjectBar.vue'
import type { DtoProject } from '@/api'
import type { PlanningMode, PlanningUnit } from '../calendar'
import { buildCells } from '../calendar'

const props = withDefaults(defineProps<{
  projects?: DtoProject[] | null
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

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
}>()

const projects = computed<DtoProject[]>(() => props.projects || [])

// Отправная точка календаря по умолчанию — самый ранний старт проекта (или текущая дата)
const defaultAnchor = computed<Date>(() => {
  let min = Infinity
  for (const p of projects.value) {
    if (!p.start_date) continue
    const ts = new Date(p.start_date).getTime()
    if (ts < min) min = ts
  }
  if (!isFinite(min)) return new Date()
  return new Date(min)
})

const anchor = computed<Date>(() => {
  if (props.anchor == null) return defaultAnchor.value
  return props.anchor instanceof Date ? props.anchor : new Date(props.anchor)
})

// Ячейки календаря фиксированной длины в зависимости от периода и единицы
const cells = computed(() => buildCells(anchor.value, props.mode, props.unit))

const gridCols = computed(() => {
  if (!cells.value.length) return '180px'
  return `180px repeat(${cells.value.length}, 1fr)`
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

          <template v-for="project in projects" :key="'proj'+project.id">
            <div class="c lc ph">
              <span class="ph-code">{{ project.project_code || '' }}</span>
            </div>
            <div class="bar-cell" style="gridColumn:2/-1">
              <ProjectBar
                :anchor="anchor!"
                :mode="mode"
                :unit="unit"
                :startDate="project.start_date || ''"
                :endDate="project.end_date || ''"
                :projectCode="project.project_code || ''"
                @change="(d) => emit('change', { id: project.id ?? 0, ...d })"
              />
            </div>
          </template>
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
  overflow: hidden;
}
</style>
