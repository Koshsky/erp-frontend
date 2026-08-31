import type { TimelineCtx } from '@/composables/timeline-context'

export interface BarProps {
  timeline: TimelineCtx
  startDate: string | Date | number
  endDate: string | Date | number
  /** Parent (process/project) bounds — restrict dragging */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
  /** Bar title (also used in the tooltip and default content) */
  title?: string
  /** Project code — badge after the title (in default content) */
  projectCode?: string
  color?: string
  opacity?: number
  /** Custom tooltip text (shown when no #tooltip slot is provided) */
  tooltip?: string
  height?: number
  top?: number
  minWidth?: number
  padding?: string
  shadow?: boolean
  /** Enables dragging and duration-resize handles */
  draggable?: boolean
  /** Vertical row reorder: pressing the bar body and dragging vertically calls
   *  this with the pointerdown event (horizontal drags keep changing dates).
   *  null/undefined — the bar body only drags dates. */
  startRowReorder?: ((e: PointerEvent) => void) | null
}
