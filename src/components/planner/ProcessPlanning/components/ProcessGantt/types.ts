import type { PlanningMode, PlanningUnit } from '../../../calendar'

export interface ProcessItem {
  id: number
  title: string
  start_date: string
  end_date: string
  owner_id?: number
  project_id?: number
}

export interface ProcessGanttProps {
  anchor: Date | number | null
  mode: PlanningMode
  unit: PlanningUnit
  projectCode?: string
  processes: ProcessItem[]
  groupStartDate?: string
  groupEndDate?: string
}
