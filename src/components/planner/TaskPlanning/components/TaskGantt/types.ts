import type { TimelineCtx } from '@/composables/timeline-context'
import type { DtoCommentResponse, DtoUserInfo } from '@/api'
import type { Task } from './components/TaskBar/types'

/** Веха процесса — одна точка на шкале с заголовком и описанием */
export interface Milestone {
  id: number
  title: string
  content?: string
  date: string
  /** Цвет маркера и луча (по умолчанию янтарный #fbbc04) */
  color?: string
}

export interface TaskGanttProps {
  timeline: TimelineCtx
  title: string
  projectCode?: string
  /** Идентификатор процесса-родителя (для создания задач/вех в группе) */
  processId?: number
  tasks: Task[]
  milestones?: Milestone[]
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
  /** Разрешает изменение задач и вех: перенос дат, редактирование, удаление */
  canManage?: boolean
  /** Справочник пользователей — имена авторов комментариев в тултипе задач */
  users?: DtoUserInfo[] | null
  /** Кэш комментариев по задаче (для лога в тултипе) */
  commentsByTask?: Record<number, DtoCommentResponse[]> | null
}
