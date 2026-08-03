import type { PlanningMode, PlanningUnit } from '../../../calendar'
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
  anchor: Date | null
  mode: PlanningMode
  unit: PlanningUnit
  title: string
  projectCode?: string
  tasks: Task[]
  milestones?: Milestone[]
  groupStartDate?: string
  groupEndDate?: string
}
