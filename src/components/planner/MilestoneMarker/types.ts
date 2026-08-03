import type { PlanningMode, PlanningUnit } from '../calendar'

export type MilestoneMarkerVariant = 'strip' | 'cell'

export interface MilestoneMarkerProps {
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  /** Дата вехи — одна точка на шкале (позиция маркера) */
  date: string | Date | number
  /** Заголовок вехи — первая строка тултипа */
  title: string
  /** Описание вехи — вторая строка тултипа */
  content?: string
  /** Цвет маркера */
  color?: string
  /** Вид маркера: полоска в пол-ячейки по центру (strip) или вся ячейка (cell) */
  variant?: MilestoneMarkerVariant
}
