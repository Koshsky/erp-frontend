import type { InjectionKey, Ref } from 'vue'
import type { PlanningUnit } from '../components/planner/calendar'

/**
 * Общие интерактивные элементы шкалы: бары, ручки реордера, вехи, липкие колонки,
 * ресурсная лента, угловая ячейка. С них нельзя начинать панорамирование, а ПКМ
 * не считается «пустым местом».
 * Внимание: отдельные списки-потребители добавляют специфичные селекторы —
 * `.tg-ms-label` (липкая полоса вех) в pan-ignore, но НЕ в contextmenu-ignore
 * (иначе ПКМ по полосе вех перестаёт открывать меню создания).
 */
export const INTERACTIVE_SELECTOR =
  '.gantt-bar, .gb-handle, .ms-marker, .row-handle, .gg-label, .gg-merged, ' +
  '.th-corner, .rs-label, .rs-block, .ts-labels, .ts-row'

/** Ключ provide/inject: элемент-скролл-контейнер бесконечной шкалы */
export const TimelineScrollKey: InjectionKey<Ref<HTMLElement | null>> = Symbol('timeline-scroll')
/** Ключ provide/inject: пересчёт окна + расширение диапазона (для драга/автопрокрутки) */
export const TimelineSyncKey: InjectionKey<() => void> = Symbol('timeline-sync')

/**
 * Контекст бесконечной шкалы для потребителей (шапка, бары, вехи).
 * Значения развёрнуты (не ref-ы); даты — через функции cellStart/cellEnd,
 * чтобы избежать оборачивания Date в reactive-Proxy.
 */
export interface TimelineCtx {
  /** Якорь-дата YYYY-MM-DD (индекс ячейки 0) */
  origin: string
  unit: PlanningUnit
  /** Ширина ячейки в px */
  cellPx: number
  /** CSS-зум контейнера: делить viewport-координаты на scale */
  scale: number
  /** Счётчик изменений масштаба: инкремент на каждом зуме — сигнал для бейджа масштаба */
  scaleBump: number
  /** Абсолютный индекс ячейки у левого края видимой шкалы */
  windowStart: number
  /** Сколько ячеек помещается в видимую область */
  viewportCells: number
  /** Ячеек слева от origin (для расчёта content-координат) */
  leftPad: number
  /** Общая ширина контента в px */
  contentWidth: number
  /** content-координата левого края сетки видимого окна */
  gridLeft: number
  /** Индексы видимых ячеек */
  visibleIndices: number[]
  /** content-координата левого края ячейки i */
  cellLeft: (i: number) => number
  /** Дата начала ячейки i */
  cellStart: (i: number) => Date
  /** Дата конца ячейки i (включительно) */
  cellEnd: (i: number) => Date
  /** Дата под указателем */
  dateAtPointer: (rect: DOMRect | null, clientX: number) => string | null
}
