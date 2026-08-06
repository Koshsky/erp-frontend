import type { ComputedRef, Ref } from 'vue'
import { CELL_WIDTH } from '../components/planner/layout'

/** Шаг расширения диапазона в ячейках: на столько растёт диапазон за раз,
 *  чтобы rebase при левой прокрутке происходил не на каждую ячейку */
export function growStep(viewportCells: number): number {
  return Math.max(Math.ceil(viewportCells * 0.5), 12)
}

/** Абсолютный индекс ячейки у левого края шкалы по позиции прокрутки */
export function windowStartFor(scrollLeft: number, cellPx: number, leftPad: number): number {
  return Math.floor(scrollLeft / cellPx - leftPad)
}

/** Адаптивный дефолт ширины ячейки из :root --cell-width (фолбэк CELL_WIDTH) */
export function readRootCellWidth(): number {
  const rootVar = getComputedStyle(document.documentElement)
    .getPropertyValue('--cell-width')
    .trim()
  const rootPx = rootVar ? parseFloat(rootVar) : CELL_WIDTH
  return Number.isFinite(rootPx) && rootPx > 0 ? rootPx : CELL_WIDTH
}

/** Ссылки диапазона шкалы, которыми управляет ensureRange */
export interface TimelineRange {
  leftPad: Ref<number>
  rightCells: Ref<number>
  cellPx: Ref<number>
  viewportCells: ComputedRef<number>
}

/**
 * Расширяет диапазон под видимую позицию vs: вправо растёт rightCells, влево —
 * leftPad (сдвиг видимой области в начало). adjust(step) вызывается при левом
 * расширении, чтобы компенсировать nsl/scrollLeft на шаг (мультипликатор у
 * каждого вызова свой: px, px*scale и т.п.).
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
