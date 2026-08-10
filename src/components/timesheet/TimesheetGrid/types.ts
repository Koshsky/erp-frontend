import type { TimelineCtx } from '@/composables/timeline-context'
import type { DtoEmployeeResponse, DtoEmployeeStateResponse, DtoStateResponse } from '@/api'

/** Сотрудник, обогащённый названием категории ресурса (resource_title) на фронте. */
export type EmployeeWithTitle = DtoEmployeeResponse & { resource_title?: string }

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
  stateForDay: (employeeId: number, iso: string) => DtoEmployeeStateResponse | undefined
  /** Ошибка загрузки/сохранения */
  error?: string | null
  /** Идёт сохранение (блокирует панель назначения) */
  busy?: boolean
}
