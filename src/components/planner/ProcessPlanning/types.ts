import type { DtoDetailedProject } from '@/api'
import type { PlanningMode, PlanningUnit } from '../calendar'
import type { ProcessItem } from './components/ProcessGantt/types'

export interface ProcessPlanningProject {
  id: number
  project_code: string
  /** Собственные временные границы проекта */
  start_date: string
  end_date: string
  owner_id?: number
  priority?: number
  processes: ProcessItem[]
}

export interface ProcessPlanningProps {
  projects?: DtoDetailedProject[] | null
  loading?: boolean
  error?: string | null
  anchor?: string | Date | number | null
  mode?: PlanningMode
  unit?: PlanningUnit
}
