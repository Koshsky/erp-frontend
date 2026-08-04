import type { PlanningMode, PlanningUnit } from '../../../calendar'

export interface ProjectGanttItem {
  id: number
  project_code: string
  start_date: string
  end_date: string
  priority?: number
  owner_name?: string
}

export interface ProjectGanttProps {
  anchor: Date | number | null
  mode: PlanningMode
  unit: PlanningUnit
  projects: ProjectGanttItem[]
}
