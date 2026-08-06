import type { TimelineCtx } from '../../../composables/useInfiniteTimeline'

export interface TodayLineProps {
  /** Контекст бесконечной шкалы */
  timeline: TimelineCtx
  /** Цвет луча (по умолчанию красный) */
  color?: string
  /** Ширина луча, px */
  width?: number
  /** Смещение луча вправо от границы «вчера/сегодня», px */
  offset?: number
}
