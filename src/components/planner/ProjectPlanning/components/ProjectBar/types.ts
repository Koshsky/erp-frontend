import type { TimelineCtx } from '@/composables/timeline-context'

export interface ProjectBarProps {
  /** Infinite timeline context */
  timeline: TimelineCtx
  startDate: string
  endDate: string
  projectCode: string
  priority?: number
  ownerName?: string
  color?: string
  opacity?: number
  /** Enables dragging and duration-resize handles */
  draggable?: boolean
}
