export interface UsageCellProps {
  /** Сколько ресурса занято (по назначениям) */
  used: number
  /** Сколько ресурса доступно (из /timesheet/calendar); null — ячейка вне окна загрузки */
  available: number | null
  /** Выходной ли день */
  isWeekend: boolean
}
