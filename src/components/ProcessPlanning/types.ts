import type { ProcessItem } from './components/ProcessGantt/types'

export interface ProcessPlanningProject {
  id: number
  project_code: string
  processes: ProcessItem[]
}

export interface ProcessPlanningProps {
  mockProjects?: ProcessPlanningProject[] | null
}

