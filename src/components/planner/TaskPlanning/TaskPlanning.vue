<script setup lang="ts">
import { computed, ref } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import TimelineGrid from '../TimelineGrid/TimelineGrid.vue'
import { PlannerStates } from '@/components/common'
import ResourceHeader from '@/components/common/ResourceHeader/ResourceHeader.vue'
import TaskGantt from './components/TaskGantt/TaskGantt.vue'
import { provideDragPreview } from '@/composables/useDragPreview'
import type { DragPreviewState } from '@/composables/useDragPreview'
import type { DtoDetailedProcess, DtoResource, DtoResourceResponse, DtoResourceCalendar, DtoResourceAbsenceResponse, DtoAvailabilityPeriod, DtoUserInfo } from '@/api'
import type { Resource } from '@/components/common/ResourceHeader/types'
import type { Process } from './types'
import type { PlanningUnit } from '../calendar'
import { toDate, fmtDate } from '../calendar'
import { shortName } from '@/utils'

const props = withDefaults(defineProps<{
  processes?: DtoDetailedProcess[] | null
  resources?: DtoResourceResponse[] | null
  /** Доступность ресурсов (periods из /timesheet/calendar), окно «сегодня ± 1 год» */
  calendar?: DtoResourceCalendar[] | null
  /** Отсутствия членов ресурсов (для тултипа UsageCell) по id ресурса */
  absenceByResource?: Record<number, DtoResourceAbsenceResponse[]> | null
  loading?: boolean
  error?: string | null
  /** Якорь шкалы: ячейка с индексом 0 (начальная позиция) */
  origin?: Date | string
  /** Единица ячейки: день или декада */
  unit?: PlanningUnit
  /** Разрешает изменение задач и вех: перенос дат, редактирование, удаление */
  canManage?: boolean
  /** Пользователи для отображения ответственного (owner_id → name) в тултипах */
  users?: DtoUserInfo[] | null
  /** При открытии прокрутить шкалу к этой дате (навигация с другой вкладки) */
  focusDate?: string | null
  /** При открытии прокрутить по вертикали к группе (строке) процесса */
  focusGroupId?: string | number | null
}>(), {
  processes: null,
  resources: null,
  calendar: null,
  absenceByResource: null,
  loading: false,
  error: null,
  origin: '',
  unit: 'day',
  canManage: true,
  users: null,
  focusDate: null,
  focusGroupId: null,
})

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  'milestone-change': [payload: { id: number; date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string | null; rowIndex: number; processId?: number; taskId?: number; milestoneId?: number }]
  'header-ctxmenu': [payload: { clientX: number; clientY: number }]
  'milestone-edit': [payload: number]
  /** Видимое окно шкалы (период «как на экране») — проброс из TimelineGrid */
  'visible-range': [payload: { from: string; to: string; cellWidthPx: number; scale: number }]
}>()

/** Активный драг задачи — для live-предпросмотра загрузки ресурсов (пишется из TaskBar) */
const dragPreview = ref<DragPreviewState>({ active: false, taskId: null, startDate: null, endDate: null })
provideDragPreview(dragPreview)

/** Маппим DTO (из /planning/tasks) во внутренние типы. Задачи сортируем по алфавиту. */
const userById = computed(() => new Map((props.users || []).map((u) => [u.id ?? 0, u])))

const displayProcesses = computed<Process[]>(() =>
  (props.processes || []).map((dto) => ({
    id: dto.id ?? 0,
    title: dto.title ?? '',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    project_code: dto.project_code ?? '',
    tasks: [...(dto.tasks || [])]
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'))
      .map((t) => {
        const owner = t.owner_id != null ? userById.value.get(t.owner_id) : undefined
        return {
          id: t.id ?? 0,
          title: t.title ?? '',
          start_date: t.start_date ?? '',
          end_date: t.end_date ?? '',
          owner_id: t.owner_id ?? null,
          owner_name: owner?.name,
          owner_short: owner ? shortName(owner) : undefined,
          resources: (t.resources || []).map((r) => ({
            resource_id: r.id ?? 0,
            assignment_id: r.assignment_id ?? 0,
            quantity: r.quantity ?? 0,
            code: r.code ?? '',
            title: r.title ?? '',
          })),
        }
      }),
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
    employeesCount: r.employees_count ?? 0,
  })),
)

/** Периоды доступности по ресурсу (для быстрого поиска по дате) */
const periodByResource = computed(() => {
  const map = new Map<number, DtoAvailabilityPeriod[]>()
  for (const rc of props.calendar ?? []) {
    if (rc.resource_id != null && Array.isArray(rc.periods)) {
      map.set(rc.resource_id, rc.periods)
    }
  }
  return map
})

/** Доступность ресурса на день из /timesheet/calendar (null — вне окна загрузки ±год) */
function availableForDay(resourceId: number, day: Date): number | null {
  const periods = periodByResource.value.get(resourceId)
  if (!periods || !periods.length) return null
  const iso = fmtDate(day)
  for (const p of periods) {
    if (p.start_date != null && p.end_date != null && iso >= p.start_date && iso <= p.end_date) {
      return p.available ?? 0
    }
  }
  return null
}

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

/** Найти задачу по id во всех процессах (для live-предпросмотра загрузки) */
function findTaskRow(taskId: number) {
  for (const proc of displayProcesses.value) {
    const t = (proc.tasks || []).find((x) => x.id === taskId)
    if (t) return t
  }
  return null
}

/** usageForDay + дельта перетаскиваемой задачи: на новый диапазон добавляем её
 *  количество, на покинутый старый — вычитаем. Цвета ячеек обновляются в реальном
 *  времени, пока кнопка мыши не отпущена. */
function usageForDayPreview(resourceId: number, day: Date): number {
  let used = usageForDay(resourceId, day)
  const p = dragPreview.value
  if (!p.active || p.taskId == null || p.startDate == null || p.endDate == null) return used
  const t = findTaskRow(p.taskId)
  if (!t) return used
  const a = (t.resources || []).find((r) => r.resource_id === resourceId)
  if (!a || a.quantity === 0) return used
  const dayT = day.getTime()
  const inNew = dayT >= toDate(p.startDate).getTime() && dayT <= toDate(p.endDate).getTime()
  const inOld = dayT >= toDate(t.start_date).getTime() && dayT <= toDate(t.end_date).getTime()
  if (inNew === inOld) return used
  return inNew ? used + a.quantity : used - a.quantity
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
  <PlannerStates :loading="loading" :error="error" :has-data="displayProcesses.length > 0">
    <TimelineGrid v-if="displayProcesses.length" id="task" :origin="origin" :unit="unit" :focus-date="focusDate" :focus-group-id="focusGroupId" @ctxmenu="onGridCtx" @header-ctxmenu="(p) => emit('header-ctxmenu', p)" @visible-range="(p) => emit('visible-range', p)">
      <template #default="{ t }">
        <CalendarHeader :t="t" />
        <ResourceHeader :t="t" :resources="displayResources" :usageFn="usageForDayPreview" :availableFn="availableForDay" :absence-by-resource="absenceByResource" />

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
          @milestone-edit="(id) => emit('milestone-edit', id)"
        />
      </template>
    </TimelineGrid>
  </PlannerStates>
</template>
