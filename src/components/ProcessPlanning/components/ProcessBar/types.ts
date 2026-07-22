export interface ProcessBarProps {
  dayZero: Date | number
  totalDays: number
  startDate: string | Date | number
  endDate: string | Date | number
  title: string
  projectCode?: string
  color?: string
  opacity?: number
}
