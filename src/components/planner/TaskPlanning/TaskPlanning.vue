<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import TimelineGrid from '../TimelineGrid/TimelineGrid.vue'
import ResourceHeader from './components/ResourceHeader/ResourceHeader.vue'
import TaskGantt from './components/TaskGantt/TaskGantt.vue'
import type { DtoDetailedProcess, DtoResource } from '@/api'
import type { Resource } from './components/ResourceHeader/types'
import type { Process } from './types'
import type { PlanningUnit } from '../calendar'
import { toDate } from '../calendar'

const props = withDefaults(defineProps<{
  processes?: DtoDetailedProcess[] | null
  resources?: DtoResource[] | null
  loading?: boolean
  error?: string | null
  /** Якорь шкалы: ячейка с индексом 0 (начальная позиция) */
  origin?: Date | string
  /** Единица ячейки: день или декада */
  unit?: PlanningUnit
  /** Разрешает изменение задач и вех: перенос дат, редактирование, удаление */
  canManage?: boolean
}>(), {
  processes: null,
  resources: null,
  loading: false,
  error: null,
  origin: '',
  unit: 'day',
  canManage: true,
})

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  'milestone-change': [payload: { id: number; date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string | null; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }]
  'task-edit': [payload: number]
  'milestone-edit': [payload: number]
}>()

/** Маппим DTO (из /planning/tasks) во внутренние типы. Задачи сортируем по алфавиту. */
const displayProcesses = computed<Process[]>(() =>
  (props.processes || []).map((dto) => ({
    id: dto.id ?? 0,
    title: dto.title ?? '',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    project_code: dto.project_code ?? '',
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

function usageForDay(resourceId: number, day: Date): number {
  let used = 0
  for (const proc of displayProcesses.value) {
    if (!proc.tasks) continue
    for (const t of proc.tasks) {
      const d = day.getTime()
      if (d < toDate(t.start_date).getTime() || d > toDate(t.end_date).getTime()) continue
      const a = (t.resources || []).find((r) => r.resource_id === resourceId)
      if (a) used += a.quantity
    }
  }
  return used
}

/** ПКМ по пустому месту внутри группы процесса — создание задачи/вехи в этом процессе */
function onGridCtx(p: { clientX: number; clientY: number; date: string | null; rowIndex?: number; groupId?: string }) {
  const processId = p.groupId ? Number(p.groupId) : undefined
  emit('contextmenu', {
    clientX: p.clientX,
    clientY: p.clientY,
    date: p.date,
    rowIndex: p.rowIndex ?? 0,
    processId,
  })
}
</script>

<template>
  <div class="pg">
    <div v-if="loading" class="st">Загрузка...</div>
    <template v-else>
      <p v-if="error" class="pg-error">{{ error }}</p>

      <TimelineGrid v-if="displayProcesses.length" id="task" :origin="origin" :unit="unit" @ctxmenu="onGridCtx">
        <template #default="{ t }">
          <CalendarHeader :t="t" />
          <ResourceHeader :t="t" :resources="displayResources" :usageFn="usageForDay" />

          <TaskGantt
            v-for="proc in displayProcesses"
            :key="'proc' + proc.id"
            :timeline="t"
            :title="proc.title"
            :projectCode="proc.project_code"
            :processId="proc.id"
            :tasks="proc.tasks || []"
            :milestones="proc.milestones || []"
            :groupStartDate="proc.start_date"
            :groupEndDate="proc.end_date"
            :can-manage="canManage"
            @change="(p) => emit('change', p)"
            @milestone-change="(p) => emit('milestone-change', p)"
            @contextmenu="(p) => emit('contextmenu', p)"
            @task-edit="(id) => emit('task-edit', id)"
            @milestone-edit="(id) => emit('milestone-edit', id)"
          />
        </template>
      </TimelineGrid>

      <div v-else-if="error" class="st er">{{ error }}</div>
      <div v-else class="st">Нет данных</div>
    </template>
  </div>
</template>

<style scoped>
.pg {
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
}
.st {
  text-align: center;
  padding: 30px;
  color: #666;
  font-size: 14px;
}
.pg-error {
  color: #d93025;
  font-size: 13px;
  padding: 8px 4px;
}
.er {
  color: #d93025;
}
</style>
