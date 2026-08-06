import type { PlanningUnit } from './calendar'

/** Ширина левой колонки с названиями (px) — общая для сетки планировщика и слоя-оверлея */
export const LABEL_WIDTH = 180

/** Ширина ячейки календаря (px) по умолчанию/фолбэк. Адаптивные значения задаются
 *  CSS-переменной --cell-width на :root (см. App.vue); треки грида используют
 *  var(--cell-width, ${CELL_WIDTH}px), поэтому в Storybook (где App.vue не грузится)
 *  срабатывает этот фолбэк. Треки всегда фиксированной ширины и не зависят от контента. */
export const CELL_WIDTH = 32

/** Высота календарного заголовка (px): день — 3 строки (месяц/число/день недели), декада — 2 строки */
export const HEADER_HEIGHT_DAY = 56
export const HEADER_HEIGHT_DECADE = 38

/** Высоты сжатых состояний шапки (px): только месяц, месяц + числа */
export const HEADER_HEIGHT_MONTH = 20
export const HEADER_HEIGHT_DAY_NUM = 38

/** Пороги ширины ячейки (px), ниже которых строки шапки скрываются */
export const CELL_PX_NUM_DAY = 6
export const CELL_PX_WD_DAY = 10
export const CELL_PX_NUM_DECADE = 14

/**
 * Высота календарного заголовка для единицы ячейки. При переданной ширине
 * ячейки (cellPx) шапка каскадно сжимается: числа/дни недели скрываются,
 * когда ячейка слишком узкая, чтобы их прочитать.
 */
export function headerHeight(unit: PlanningUnit, cellPx?: number): number {
  if (unit === 'day') {
    if (cellPx == null) return HEADER_HEIGHT_DAY
    if (cellPx < CELL_PX_NUM_DAY) return HEADER_HEIGHT_MONTH
    if (cellPx < CELL_PX_WD_DAY) return HEADER_HEIGHT_DAY_NUM
    return HEADER_HEIGHT_DAY
  }
  if (cellPx == null) return HEADER_HEIGHT_DECADE
  if (cellPx < CELL_PX_NUM_DECADE) return HEADER_HEIGHT_MONTH
  return HEADER_HEIGHT_DECADE
}
