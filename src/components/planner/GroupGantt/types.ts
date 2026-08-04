import type { PlanningMode, PlanningUnit } from '../calendar'

export interface GroupGanttItem {
  id: number
  title: string
  start_date: string
  end_date: string
}

export interface GroupGanttProps {
  anchor: Date | number | null
  mode: PlanningMode
  unit: PlanningUnit
  items: GroupGanttItem[]
  /** Границы группы (опционально — для подсветки на шкале) */
  groupStartDate?: string
  groupEndDate?: string
  /** Высота полосы-дорожки под заголовком (px); сюда же опирается луч вехи */
  headerBarHeight?: number
  /** Включает перетаскивание строк (ручка в колонке названий) для смены порядка */
  reorderable?: boolean
}
