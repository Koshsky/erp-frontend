import type { TimelineCtx } from '@/composables/timeline-context'

export interface BarProps {
  timeline: TimelineCtx
  startDate: string | Date | number
  endDate: string | Date | number
  /** Границы родителя (процесса/проекта) — ограничивают перетаскивание */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
  /** Название бара (также используется в тултипе и контенте по умолчанию) */
  title?: string
  /** Код проекта — бейдж после названия (в контенте по умолчанию) */
  projectCode?: string
  color?: string
  opacity?: number
  /** Текст кастомного тултипа (показывается, если не передан слот #tooltip) */
  tooltip?: string
  height?: number
  top?: number
  minWidth?: number
  padding?: string
  shadow?: boolean
  /** Включает перетаскивание и ручки изменения длительности */
  draggable?: boolean
}
