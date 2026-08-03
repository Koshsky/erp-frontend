import type { PlanningMode, PlanningUnit } from '../calendar'

export interface GanttBarProps {
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  startDate: string | Date
  endDate: string | Date
  color?: string
  opacity?: number
}
