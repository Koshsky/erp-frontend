import type { DtoProject } from '@/api'
import type { PlanningUnit } from '../calendar'

export interface ProjectItem {
  id: number
  project_code: string
  start_date: string
  end_date: string
}

export interface ProjectPlanningProps {
  projects?: DtoProject[] | null
  /** Якорь шкалы: ячейка с индексом 0 (начальная позиция) */
  origin?: string | Date
  /** Единица ячейки: день или декада */
  unit?: PlanningUnit
}

export type { PlanningUnit }
