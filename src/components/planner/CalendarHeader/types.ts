import type { PlanningMode, PlanningUnit } from '../calendar'

export interface CalendarHeaderProps {
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
}
