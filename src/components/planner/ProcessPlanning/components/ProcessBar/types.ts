import type { TimelineCtx } from '@/composables/useInfiniteTimeline'

export interface ProcessBarProps {
  /** Контекст бесконечной шкалы */
  timeline: TimelineCtx
  startDate: string | Date | number
  endDate: string | Date | number
  title: string
  projectCode?: string
  ownerName?: string
  color?: string
  opacity?: number
  /** Включает перетаскивание и ручки изменения длительности */
  draggable?: boolean
  /** Границы проекта — ограничивают перетаскивание процесса */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
}
