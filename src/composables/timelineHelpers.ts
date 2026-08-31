import type { ComputedRef, Ref } from 'vue'
import { CELL_WIDTH } from '../components/planner/layout'

/** Range growth step in cells: how much the range grows per single expansion,
 *  so that rebase on left scroll does not happen on every cell */
export function growStep(viewportCells: number): number {
  return Math.max(Math.ceil(viewportCells * 0.5), 12)
}

/** Absolute cell index at the left edge of the timeline from the scroll position */
export function windowStartFor(scrollLeft: number, cellPx: number, leftPad: number): number {
  return Math.floor(scrollLeft / cellPx - leftPad)
}

/** Adaptive default cell width from :root --cell-width (falls back to CELL_WIDTH) */
export function readRootCellWidth(): number {
  const rootVar = getComputedStyle(document.documentElement)
    .getPropertyValue('--cell-width')
    .trim()
  const rootPx = rootVar ? parseFloat(rootVar) : CELL_WIDTH
  return Number.isFinite(rootPx) && rootPx > 0 ? rootPx : CELL_WIDTH
}

/** Timeline range refs managed by ensureRange */
export interface TimelineRange {
  leftPad: Ref<number>
  rightCells: Ref<number>
  cellPx: Ref<number>
  viewportCells: ComputedRef<number>
}

/**
 * Extends the range to cover the visible position vs: to the right rightCells grows, to the left —
 * leftPad (shifting the visible area toward the start). adjust(step) is called on left
 * expansion to compensate nsl/scrollLeft by the step (the multiplier varies per
 * call site: px, px*scale, etc.).
 */
export function ensureRange(
  vs: number,
  range: TimelineRange,
  adjust?: (step: number) => void,
): void {
  const step = growStep(range.viewportCells.value)
  const visibleEnd = vs + range.viewportCells.value + 1
  if (visibleEnd + step > range.rightCells.value) {
    range.rightCells.value = visibleEnd + step
  }
  if (vs - step < -range.leftPad.value) {
    range.leftPad.value += step
    adjust?.(step)
  }
}
