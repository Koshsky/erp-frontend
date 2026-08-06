export interface GanttTooltipResource {
  label: string
  quantity?: number
}

export interface GanttTooltipProps {
  /** Заголовок тултипа (название бара) */
  title: string
  /** Дополнительные строки (даты, владелец, приоритет и т.п.) */
  rows?: string[]
  /** Список ресурсов с количеством — отдельным блоком с разделителем */
  resources?: GanttTooltipResource[]
}
