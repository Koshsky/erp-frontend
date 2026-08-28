import type { TimelineCtx } from '../../../composables/timeline-context'

export interface GroupGanttItem {
  id: number
  title: string
  start_date: string
  end_date: string
}

export interface GroupGanttProps {
  /** Infinite timeline context */
  timeline: TimelineCtx
  items: GroupGanttItem[]
  /** Group bounds (optional — highlight on the timeline) */
  groupStartDate?: string | Date | number | null
  groupEndDate?: string | Date | number | null
  /** Enables row reordering (handle in the label column) to change order */
  reorderable?: boolean
  /** Merges the label column into one cell spanning the whole group height (#label slot) */
  mergedLabel?: boolean
  /** Parent group identifier (project_id/process_id) — for creating inside the group */
  groupId?: string | number | null
  /** Row height in px (default 26); sets .gg-row and merged-label height */
  rowHeight?: number
  /** Min merged-label height (px): so code/name/dates don't shrink or vanish with 0–1 rows */
  minLabelHeight?: number
  /** Minimum number of group rows (empty placeholder rows pad up to this count) */
  minRows?: number
}
