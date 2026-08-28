import type { TimelineCtx } from '@/composables/timeline-context'

export interface ProjectGanttItem {
  id: number
  project_code: string
  start_date: string
  end_date: string
  priority?: number
  owner_name?: string
}

export interface ProjectGanttProps {
  timeline: TimelineCtx
  projects: ProjectGanttItem[]
  /** Allows reordering rows (changing priorities) */
  reorderable?: boolean
  /** Manage-rights check for a project: editing, deleting, moving dates */
  canManage?: (projectId: number) => boolean
}
