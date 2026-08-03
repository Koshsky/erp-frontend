import type { PlanningMode, PlanningUnit } from '../../../calendar'

export interface Resource {
  id: number
  code: string
  title: string
  quantity: number
}

export interface ResourceHeaderProps {
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  resources: Resource[]
  usageFn: (resourceId: number, day: Date) => number
}
