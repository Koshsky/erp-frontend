import type { TimelineCtx } from '@/composables/timeline-context'
import type { DtoEmployeeResponse, DtoEmployeeStateResponse, DtoStateResponse } from '@/api'

export interface AssignPayload {
  employeeId: number
  stateId: number
  startDate: string
  endDate: string
}

export interface ClearPayload {
  employeeId: number
  startDate: string
  endDate: string
}

export interface TimesheetGridProps {
  t: TimelineCtx
  employees: DtoEmployeeResponse[]
  states: DtoStateResponse[]
  /** Состояние, покрывающее день сотрудника (undefined — рабочий день) */
  stateForDay: (employeeId: number, iso: string) => DtoEmployeeStateResponse | undefined
  /** Ошибка загрузки/сохранения */
  error?: string | null
  /** Идёт сохранение (блокирует панель назначения) */
  busy?: boolean
}
