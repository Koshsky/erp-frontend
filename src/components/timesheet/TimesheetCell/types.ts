import type { DtoUserStateResponse } from '@/api'

export interface TimesheetCellProps {
  /** State covering the day; null — a workday without a record */
  state?: DtoUserStateResponse | null
  /** Whether the day is a day off (when there is no state) */
  isWeekend?: boolean
  /** Cell is selected (drag range selection) */
  selected?: boolean
  /** Whether to show the state code (wide cells) */
  showText?: boolean
}
