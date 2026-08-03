import type { PlanningMode, PlanningUnit } from '../../../calendar'

export interface ProjectBarProps {
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  startDate: string
  endDate: string
  projectCode: string
  color?: string
  opacity?: number
  /** Включает перетаскивание и ручки изменения длительности */
  draggable?: boolean
}
