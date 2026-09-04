import type { DtoDetailedProcess, DtoResource } from '@/api'
import type { PlanningUnit } from '../calendar'
import type { Milestone } from './components/TaskGantt/types'
import type { Task } from './components/TaskGantt/components/TaskBar/types'
import type { Resource } from '@/components/common/ResourceHeader/types'

export interface Process {
  id: number
  title: string
  start_date: string
  end_date: string
  project_code?: string
  tasks: Task[]
  milestones: Milestone[]
}

export interface TaskPlanningProps {
  processes?: DtoDetailedProcess[] | null
  resources?: DtoResource[] | null
  loading?: boolean
  error?: string | null
  /** Timeline anchor: cell with index 0 (starting position) */
  origin?: string | Date
  /** Cell unit: day or decade */
  unit?: PlanningUnit
}
