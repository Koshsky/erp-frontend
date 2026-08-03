import type { PlanningMode, PlanningUnit } from '../calendar'

export interface GanttBarProps {
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  startDate: string | Date | number
  endDate: string | Date | number
  /** Границы родителя (процесса/проекта) — ограничивают перетаскивание */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
  color?: string
  opacity?: number
  /** Нативный тултип при наведении */
  title?: string
  height?: number
  top?: number
  minWidth?: number
  padding?: string
  shadow?: boolean
  /** Включает перетаскивание и ручки изменения длительности */
  draggable?: boolean
}
