import type { TimelineCtx } from '@/composables/timeline-context'

export interface LabeledBarProps {
  timeline: TimelineCtx
  startDate: string | Date | number
  endDate: string | Date | number
  /** Границы родителя — ограничивают перетаскивание */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
  /** Название бара (также используется в тултипе) */
  title: string
  /** Код проекта — бейдж после названия (по умолчанию контент слота) */
  projectCode?: string
  color?: string
  opacity?: number
  height?: number
  top?: number
  minWidth?: number
  padding?: string
  shadow?: boolean
  draggable?: boolean
}
