import type { TimelineCtx } from '@/composables/timeline-context'

export interface TaskResource {
  resource_id: number
  assignment_id: number
  quantity: number
  code: string
  title?: string
}

export interface Task {
  id: number
  title: string
  start_date: string
  end_date: string
  resources: TaskResource[]
  /** Ответственный (владелец) задачи: id назначенного пользователя */
  owner_id?: number | null
  /** Имя ответственного (резолвится из owner_id по справочнику users) */
  owner_name?: string
  /** Короткое ФИО ответственного «Фамилия И.О.» — для бейджа на баре задачи */
  owner_short?: string
}

export interface TaskBarProps {
  timeline: TimelineCtx
  task: Task
  /** Код проекта — показывается бейджем сразу после названия задачи */
  projectCode?: string
  draggable?: boolean
  /** Границы процесса — ограничивают перетаскивание задачи */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
}
