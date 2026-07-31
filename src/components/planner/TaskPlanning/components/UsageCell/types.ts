export interface UsageCellProps {
  /** Сколько ресурса занято */
  used: number
  /** Сколько всего ресурса */
  total: number
  /** Выходной ли день */
  isWeekend: boolean
}
