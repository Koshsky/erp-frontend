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
  /** Включает перетаскивание и ручки изменения длительности */
  draggable?: boolean
  /** Границы проекта — ограничивают перетаскивание процесса */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
}
