import type { TimelineCtx } from '../../../composables/timeline-context'

export interface GroupGanttItem {
  id: number
  title: string
  start_date: string
  end_date: string
}

export interface GroupGanttProps {
  /** Контекст бесконечной шкалы */
  timeline: TimelineCtx
  items: GroupGanttItem[]
  /** Границы группы (опционально — подсветка на шкале) */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
  /** Включает перетаскивание строк (ручка в колонке названий) для смены порядка */
  reorderable?: boolean
  /** Сливает колонку названий в одну ячейку на всю высоту группы (слот #label) */
  mergedLabel?: boolean
  /** Идентификатор родителя группы (project_id/process_id) — для создания внутри группы */
  groupId?: string | number | null
  /** Высота строки в px (default 26); задаёт высоту .gg-row и merged-лейбла */
  rowHeight?: number
  /** Мин. высота объединённого лейбла (px): чтобы при 0–1 строках код/имя/даты не сжимались и не исчезали */
  minLabelHeight?: number
}
