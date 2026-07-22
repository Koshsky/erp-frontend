export interface GroupGanttItem {
  id: number
  title: string
  start_date: string
  end_date: string
}

export interface GroupGanttProps {
  dayZero: Date | number | null
  totalDays: number
  items: GroupGanttItem[]
  /** Границы группы (опционально — для подсветки на шкале) */
  groupStartDate?: string
  groupEndDate?: string
}
