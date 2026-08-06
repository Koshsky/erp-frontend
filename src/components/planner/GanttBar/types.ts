import type { TimelineCtx } from '@/composables/timeline-context'

export interface GanttBarProps {
  /** Контекст бесконечной шкалы */
  timeline: TimelineCtx
  startDate: string | Date | number
  endDate: string | Date | number
  /** Границы родителя (процесса/проекта) — ограничивают перетаскивание */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
  color?: string
  opacity?: number
  /** Нативный тултип при наведении */
  title?: string
  tooltip?: string
  height?: number
  top?: number
  minWidth?: number
  padding?: string
  shadow?: boolean
  /** Включает перетаскивание и ручки изменения длительности */
  draggable?: boolean
}
