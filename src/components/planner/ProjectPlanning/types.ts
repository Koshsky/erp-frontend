export interface ProjectItem {
  id: number
  project_code: string
  start_date: string
  end_date: string
}

/** Период отображения календаря */
export type PlanningPeriod = 'quarter' | 'half' | 'year'

export interface ProjectPlanningProps {
  projects?: ProjectItem[] | null
  /** Период календаря: квартал (3 мес), полугодие или год */
  period?: PlanningPeriod
}
