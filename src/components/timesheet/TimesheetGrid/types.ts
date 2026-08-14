import type { TimelineCtx } from '@/composables/timeline-context'
import type { DtoUserResponse, DtoUserStateResponse, DtoStateResponse } from '@/api'

/** Сотрудник табеля — пользователь с ролью worker */
export type EmployeeWithTitle = DtoUserResponse

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
  employees: EmployeeWithTitle[]
  states: DtoStateResponse[]
  /** Состояние, покрывающее день сотрудника (undefined — рабочий день) */
  stateForDay: (employeeId: number, iso: string) => DtoUserStateResponse | undefined
  /** Ошибка загрузки/сохранения */
  error?: string | null
  /** Идёт сохранение (блокирует панель назначения) */
  busy?: boolean
}
