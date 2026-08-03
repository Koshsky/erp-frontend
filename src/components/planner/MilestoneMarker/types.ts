import type { PlanningMode, PlanningUnit } from '../calendar'

export interface MilestoneMarkerProps {
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  /** Дата вехи — одна точка на шкале (позиция флажка) */
  date: string | Date | number
  /** Заголовок вехи — первая строка тултипа */
  title: string
  /** Описание вехи — вторая строка тултипа */
  content?: string
  /** Цвет флажка и древка */
  color?: string
  /** Высота шапки (px), в которой стоит флажок; когда задана — рисуется древко вниз до низа блока */
  headerHeight?: number
}
