import type { DtoProject } from '@/api'
import type { PlanningMode, PlanningUnit } from '../calendar'

export interface ProjectItem {
  id: number
  project_code: string
  start_date: string
  end_date: string
}

export interface ProjectPlanningProps {
  projects?: DtoProject[] | null
  anchor?: string | Date | number | null
  /** Период календаря: квартал (3 мес), полугодие или год */
  mode?: PlanningMode
  /** Единица ячейки: день, неделя или декада */
  unit?: PlanningUnit
}

export type { PlanningMode, PlanningUnit }
