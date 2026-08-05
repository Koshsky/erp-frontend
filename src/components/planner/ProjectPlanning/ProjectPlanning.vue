<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import TimelineGrid from '../TimelineGrid/TimelineGrid.vue'
import ProjectGantt from './components/ProjectGantt/ProjectGantt.vue'
import type { DtoProject, DtoUserInfo } from '@/api'
import type { PlanningUnit } from '../calendar'

const props = withDefaults(defineProps<{
  projects?: DtoProject[] | null
  loading?: boolean
  error?: string | null
  /** Якорь шкалы: ячейка с индексом 0 (начальная позиция) */
  origin?: Date | string
  /** Единица ячейки: день или декада */
  unit?: PlanningUnit
  /** Пользователи для отображения владельца (owner_id → name) в тултипах */
  users?: DtoUserInfo[] | null
  /** Разрешает переупорядочивание строк (смену приоритетов) */
  reorderable?: boolean
  /** Проверка прав на управление проектом */
  canManage?: (projectId: number) => boolean
}>(), {
  projects: null,
  loading: false,
  error: null,
  origin: '',
  unit: 'day',
  users: null,
  reorderable: true,
  canManage: () => true,
})

const emit = defineEmits<{
  change: [payload: { id: number; start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number; date: string | null; rowIndex: number; projectId?: number }]
  reorder: [payload: { from: number; to: number }]
  edit: [payload: number]
}>()

const userNames = computed(() => new Map((props.users || []).map((u) => [u.id, u.name])))

const displayProjects = computed(() =>
  (props.projects || []).map((dto) => ({
    id: dto.id ?? 0,
    project_code: dto.project_code ?? '',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    priority: dto.priority,
    owner_name: dto.owner_id != null ? userNames.value.get(dto.owner_id) : undefined,
  })),
)

/** ПКМ по пустому месту шкалы — создание проекта в позиции строки под курсором */
function onGridCtx(p: { clientX: number; clientY: number; date: string | null; rowIndex?: number }) {
  emit('contextmenu', {
    clientX: p.clientX,
    clientY: p.clientY,
    date: p.date,
    rowIndex: p.rowIndex ?? 0,
  })
}
</script>

<template>
  <div class="pg">
    <div v-if="loading" class="st">Загрузка...</div>
    <template v-else>
      <p v-if="error" class="pg-error">{{ error }}</p>

      <TimelineGrid v-if="displayProjects.length" :origin="origin" :unit="unit" @ctxmenu="onGridCtx">
        <template #default="{ t }">
          <CalendarHeader :t="t" />
          <ProjectGantt
            :timeline="t"
            :projects="displayProjects"
            :reorderable="reorderable"
            :can-manage="canManage"
            @change="(p) => emit('change', p)"
            @contextmenu="(p) => emit('contextmenu', p)"
            @reorder="(p) => emit('reorder', p)"
            @edit="(id) => emit('edit', id)"
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
