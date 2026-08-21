import type { DtoUserStateResponse } from '@/api'

export interface TimesheetCellProps {
  /** Состояние, покрывающее день; null — рабочий день без записи */
  state?: DtoUserStateResponse | null
  /** Выходной ли день (когда нет состояния) */
  isWeekend?: boolean
  /** Ячейка выделена (drag-выделение диапазона) */
  selected?: boolean
  /** Показывать ли код состояния (широкие ячейки) */
  showText?: boolean
}
