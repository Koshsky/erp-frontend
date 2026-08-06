import type { TimelineCtx } from '@/composables/timeline-context'

export interface ProjectBarProps {
  /** Контекст бесконечной шкалы */
  timeline: TimelineCtx
  startDate: string
  endDate: string
  projectCode: string
  priority?: number
  ownerName?: string
  color?: string
  opacity?: number
  /** Включает перетаскивание и ручки изменения длительности */
  draggable?: boolean
}
