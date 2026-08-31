import type { InjectionKey, Ref } from 'vue'
import type { PlanningUnit } from '../components/planner/calendar'

/**
 * Shared interactive timeline elements: bars, reorder handles, milestones, sticky columns,
 * resource ribbon, corner cell. Panning cannot start from them, and a right-click
 * on them is not treated as "empty space".
 * Note: individual consumer lists add their own specific selectors —
 * `.tg-ms-label` (sticky milestone strip) to pan-ignore, but NOT to contextmenu-ignore
 * (otherwise right-click on the milestone strip stops opening the create menu).
 */
export const INTERACTIVE_SELECTOR =
  '.gantt-bar, .gb-handle, .ms-marker, .row-handle, .gg-label, .gg-merged, ' +
  '.th-corner, .rs-label, .rs-block, .ts-labels, .ts-row'

/**
 * Elements whose double-click does NOT reset the scale (interactive + header).
 * Differs from INTERACTIVE_SELECTOR: sticky timesheet columns/rows (.ts-labels,
 * .ts-row) are in INTERACTIVE_SELECTOR only to ignore panning,
 * but double-clicking them should reset the zoom.
 */
export const DBLCLICK_IGNORE_SELECTOR =
  '.gantt-bar, .gb-handle, .ms-marker, .row-handle, .gg-label, .gg-merged, ' +
  '.th-corner, .rs-label, .rs-block, .tg-head'

/** provide/inject key: scroll container element of the infinite timeline */
export const TimelineScrollKey: InjectionKey<Ref<HTMLElement | null>> = Symbol('timeline-scroll')
/** provide/inject key: window recompute + range extension (for drag/autoscroll) */
export const TimelineSyncKey: InjectionKey<() => void> = Symbol('timeline-sync')

/**
 * Infinite timeline context for consumers (header, bars, milestones).
 * Values are unwrapped (not refs); dates come via cellStart/cellEnd functions
 * to avoid wrapping Date in a reactive Proxy.
 */
export interface TimelineCtx {
  /** Anchor date YYYY-MM-DD (cell index 0) */
  origin: string
  unit: PlanningUnit
  /** Cell width in px */
  cellPx: number
  /** Container CSS zoom: divide viewport coordinates by scale */
  scale: number
  /** Scale change counter: incremented on every zoom — signal for the scale badge */
  scaleBump: number
  /** Absolute cell index at the left edge of the visible timeline */
  windowStart: number
  /** How many cells fit into the visible area */
  viewportCells: number
  /** Cells to the left of origin (for content-coordinate math) */
  leftPad: number
  /** Total content width in px */
  contentWidth: number
  /** Content coordinate of the visible window grid's left edge */
  gridLeft: number
  /** Indices of visible cells */
  visibleIndices: number[]
  /** Content coordinate of cell i's left edge */
  cellLeft: (i: number) => number
  /** Start date of cell i */
  cellStart: (i: number) => Date
  /** End date of cell i (inclusive) */
  cellEnd: (i: number) => Date
  /** Date under the pointer */
  dateAtPointer: (rect: DOMRect | null, clientX: number) => string | null
}
