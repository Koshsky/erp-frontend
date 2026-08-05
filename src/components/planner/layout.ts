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

/** Высота календарного заголовка для единицы ячейки */
export function headerHeight(unit: PlanningUnit): number {
  return unit === 'day' ? HEADER_HEIGHT_DAY : HEADER_HEIGHT_DECADE
}
