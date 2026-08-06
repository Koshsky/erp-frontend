import type { TimelineCtx } from '@/composables/timeline-context'

export interface ProjectGanttItem {
  id: number
  project_code: string
  start_date: string
  end_date: string
  priority?: number
  owner_name?: string
}

export interface ProjectGanttProps {
  timeline: TimelineCtx
  projects: ProjectGanttItem[]
  /** Разрешает переупорядочивание строк (смену приоритетов) */
  reorderable?: boolean
  /** Проверка прав на управление проектом: редактирование, удаление, перенос дат */
  canManage?: (projectId: number) => boolean
}
