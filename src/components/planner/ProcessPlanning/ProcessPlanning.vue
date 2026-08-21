<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import TimelineGrid from '../TimelineGrid/TimelineGrid.vue'
import { PlannerStates } from '@/components/common'
import ProcessGantt from './components/ProcessGantt/ProcessGantt.vue'
import type { DtoDetailedProject, DtoUserInfo } from '@/api'
import type { PlanningUnit } from '../calendar'

const props = withDefaults(defineProps<{
  projects?: DtoDetailedProject[] | null
  loading?: boolean
  error?: string | null
  /** Якорь шкалы: ячейка с индексом 0 (начальная позиция) */
  origin?: Date | string
  /** Единица ячейки: день или декада */
  unit?: PlanningUnit
  /** Пользователи для отображения владельца (owner_id → name) в тултипах */
  users?: DtoUserInfo[] | null
  /** Разрешает изменение процессов: перенос дат, редактирование, удаление */
  canManage?: boolean
  /** При открытии прокрутить шкалу к этой дате (навигация с другой вкладки) */
  focusDate?: string | null
  /** При открытии прокрутить по вертикали к группе (строке) проекта */
  focusGroupId?: string | number | null
}>(), {
  projects: null,
  loading: false,
  error: null,
  origin: '',
  unit: 'day',
  users: null,
  canManage: true,
  focusDate: null,
  focusGroupId: null,
})

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string | null; rowIndex: number; projectId?: number; processId?: number }]
  'header-ctxmenu': [payload: { clientX: number; clientY: number }]
  navigate: [payload: number]
  /** Видимое окно шкалы (период «как на экране») — проброс из TimelineGrid */
  'visible-range': [payload: { from: string; to: string; cellWidthPx: number; scale: number }]
}>()

const userNames = computed(() => new Map((props.users || []).map((u) => [u.id, u.name])))

/** Маппим DTO (из /planning/processes) во внутренний тип. Процессы сортируем по алфавиту. */
const displayProjects = computed(() =>
  (props.projects || []).map((dto) => ({
    id: dto.id ?? 0,
    project_code: dto.project_code ?? '',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    priority: dto.priority,
    processes: [...(dto.processes || [])]
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'))
      .map((p) => ({
        id: p.id ?? 0,
        title: p.title ?? '',
        start_date: p.start_date ?? '',
        end_date: p.end_date ?? '',
        owner_id: p.owner_id,
        owner_name: p.owner_id != null ? userNames.value.get(p.owner_id) : undefined,
        project_id: p.project_id,
      })),
  })),
)

/** ПКМ по пустому месту внутри группы проекта — создание процесса в этом проекте */
function onGridCtx(p: { clientX: number; clientY: number; date: string | null; rowIndex?: number; groupId?: string }) {
  const projectId = p.groupId ? Number(p.groupId) : undefined
  emit('contextmenu', {
    clientX: p.clientX,
    clientY: p.clientY,
    date: p.date,
    rowIndex: p.rowIndex ?? 0,
    projectId,
  })
}
</script>

<template>
  <PlannerStates :loading="loading" :error="error" :has-data="displayProjects.length > 0">
    <TimelineGrid v-if="displayProjects.length" id="process" :origin="origin" :unit="unit" :focus-date="focusDate" :focus-group-id="focusGroupId" @ctxmenu="onGridCtx" @header-ctxmenu="(p) => emit('header-ctxmenu', p)" @visible-range="(p) => emit('visible-range', p)">
      <template #default="{ t }">
        <CalendarHeader :t="t" />
        <ProcessGantt
          v-for="project in displayProjects"
          :key="'proj' + project.id"
          :timeline="t"
          :projectCode="project.project_code"
          :projectId="project.id"
          :processes="project.processes"
          :groupStartDate="project.start_date"
          :groupEndDate="project.end_date"
          :can-manage="canManage"
          @change="(p) => emit('change', p)"
          @contextmenu="(p) => emit('contextmenu', p)"
          @navigate="(id) => emit('navigate', id)"
        />
      </template>
    </TimelineGrid>
  </PlannerStates>
</template>

