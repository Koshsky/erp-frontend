import type { TimelineCtx } from '@/composables/timeline-context'

export interface ProcessItem {
  id: number
  title: string
  start_date: string
  end_date: string
  owner_id?: number
  owner_name?: string
  project_id?: number
}

export interface ProcessGanttProps {
  timeline: TimelineCtx
  projectCode?: string
  /** Идентификатор проекта-родителя (для создания процессов в группе) */
  projectId?: number
  processes: ProcessItem[]
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
  /** Разрешает изменение процессов: перенос дат, редактирование, удаление */
  canManage?: boolean
}
