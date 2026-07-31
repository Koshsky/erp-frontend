export interface TaskResource {
  resource_id: number
  quantity: number
  code: string
}

export interface Task {
  id: number
  title: string
  start_date: string
  end_date: string
  resources: TaskResource[]
}

export interface TaskBarProps {
  dayZero: Date | null
  totalDays: number
  task: Task
}
