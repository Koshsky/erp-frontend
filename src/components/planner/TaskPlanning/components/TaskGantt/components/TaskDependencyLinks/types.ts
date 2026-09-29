import type { TimelineCtx } from '@/composables/timeline-context'
import type { DependencyEdge } from '../../../../../dependencies'

/** A dependency arrow between two top-level task rows of a process. */
export interface DependencyArrow {
  key: string
  /** Elbow polyline points (container-local pixels). */
  points: string
  /** Arrowhead tip (the bound point on the successor). */
  tipX: number
  tipY: number
  /** Arrowhead direction: 1 — right, -1 — left. */
  dir: 1 | -1
}

export interface TaskDependencyLinksProps {
  timeline: TimelineCtx
  tasks: Array<{ id: number; start_date: string; end_date: string }>
  dependencies?: DependencyEdge[]
}