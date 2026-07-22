export interface ProjectItem {
  id: number
  project_code: string
  start_date: string
  end_date: string
}

export interface ProjectPlanningProps {
  projects?: ProjectItem[] | null
}
