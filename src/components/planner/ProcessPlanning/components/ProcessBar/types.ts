import type { PlanningMode, PlanningUnit } from '../../../calendar'

export interface ProcessBarProps {
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  startDate: string | Date | number
  endDate: string | Date | number
  title: string
  projectCode?: string
  color?: string
  opacity?: number
}
