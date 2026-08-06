import type { TimelineCtx } from '@/composables/useInfiniteTimeline'
import {
  cellStartDate,
  cellEndDate,
  fmtDate,
  toDate,
  type PlanningUnit,
} from './calendar'
import { CELL_WIDTH, LABEL_WIDTH } from './layout'

/**
 * Демо-контекст бесконечной шкалы для Storybook: фиксированные параметры,
 * без скролл-контейнера (бары позиционируются от левого края, без колонки названий).
 */
export function makeDemoTimeline(
  origin: string | Date,
  unit: PlanningUnit,
  opts?: { cellPx?: number; windowStart?: number; viewportCells?: number },
): TimelineCtx {
  const o = toDate(origin)
  const cellPx = opts?.cellPx ?? CELL_WIDTH
  const windowStart = opts?.windowStart ?? 0
  const viewportCells = opts?.viewportCells ?? 40
  return {
    origin: fmtDate(o),
    unit,
    cellPx,
    scale: 1,
    windowStart,
    viewportCells,
    leftPad: 0,
    contentWidth: LABEL_WIDTH + viewportCells * cellPx,
    gridLeft: LABEL_WIDTH,
    visibleIndices: Array.from({ length: viewportCells }, (_, k) => windowStart + k),
    cellLeft: (i) => (i - windowStart) * cellPx,
    cellStart: (i) => cellStartDate(o, unit, i),
    cellEnd: (i) => cellEndDate(o, unit, i),
    dateAtPointer: () => null,
  }
}
