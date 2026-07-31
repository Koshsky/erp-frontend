import type { Task } from './components/TaskGantt/components/TaskBar/types'
import type { Resource } from './components/ResourceHeader/types'

export interface Process {
  id: number
  title: string
  start_date: string
  end_date: string
  project_code?: string
  tasks: Task[]
}

export interface TaskPlanningProps {
  mockProcesses?: Process[] | null
  mockResources?: Resource[] | null
}
