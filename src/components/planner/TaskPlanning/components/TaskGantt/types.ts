import type { PlanningMode, PlanningUnit } from '../../../calendar'
import type { Task } from './components/TaskBar/types'

export interface TaskGanttProps {
  anchor: Date | null
  mode: PlanningMode
  unit: PlanningUnit
  title: string
  projectCode?: string
  tasks: Task[]
  groupStartDate?: string
  groupEndDate?: string
}
