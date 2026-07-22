import type { Task } from './components/TaskBar/types'

export interface TaskGanttProps {
  dayZero: Date | null
  totalDays: number
  title: string
  projectCode?: string
  tasks: Task[]
  groupStartDate?: string
  groupEndDate?: string
}
