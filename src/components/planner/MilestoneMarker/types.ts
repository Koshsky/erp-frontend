import type { TimelineCtx } from '../../../composables/useInfiniteTimeline'

export interface MilestoneMarkerProps {
  /** Контекст бесконечной шкалы */
  timeline: TimelineCtx
  /** Дата вехи — одна точка на шкале (позиция флажка) */
  date: string | Date | number
  /** Заголовок вехи — первая строка тултипа */
  title: string
  /** Описание вехи — вторая строка тултипа */
  content?: string
  /** Цвет флажка и древка */
  color?: string
  /** Высота полосы вех (px), в которой стоит флажок; ниже — луч вниз до конца группы */
  stripHeight?: number
  /** Разрешить перетаскивание вехи (сдвиг по ячейкам; на отпускание — @change) */
  draggable?: boolean
  /** Границы процесса — веха не перетаскивается за их пределы */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
}
