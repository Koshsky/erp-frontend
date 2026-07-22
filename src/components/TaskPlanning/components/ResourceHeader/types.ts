export interface Resource {
  id: number
  code: string
  title: string
  quantity: number
}

export interface ResourceHeaderProps {
  dayList: Date[]
  resources: Resource[]
  usageFn: (resourceId: number, day: Date) => number
}
