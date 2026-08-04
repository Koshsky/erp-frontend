import type { PlanningMode, PlanningUnit } from '../../../../../calendar'

export interface TaskResource {
  resource_id: number
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
}

export interface TaskBarProps {
  anchor: Date | null
  mode: PlanningMode
  unit: PlanningUnit
  task: Task
  draggable?: boolean
  /** Границы процесса — ограничивают перетаскивание задачи */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
}
