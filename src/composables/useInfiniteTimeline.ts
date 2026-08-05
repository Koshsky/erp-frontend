import { computed, nextTick, ref } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import {
  cellEndDate,
  cellStartDate,
  dateForPointer,
  windowCells,
  toDate,
  type CalendarCell,
  type PlanningUnit,
} from '../components/planner/calendar'
import { CELL_WIDTH, LABEL_WIDTH } from '../components/planner/layout'

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

export interface InfiniteTimeline {
  /** Ширина ячейки в px (из CSS-переменной --cell-width, адаптивная) */
  cellPx: Ref<number>
  /** Абсолютный индекс ячейки у левого края видимой шкалы (floor) */
  windowStart: Ref<number>
  /** Сколько ячеек помещается в видимую область шкалы */
  viewportCells: ComputedRef<number>
  /** Ячеек, «материализованных» слева от origin (origin — индекс 0) */
  leftPad: Ref<number>
  /** Общая ширина контента в px: LABEL_WIDTH + (leftPad+rightCells)*cellPx */
  contentWidth: ComputedRef<number>
  /** Видимые ячейки (виртуализация): windowStart … windowStart+viewportCells+2 */
  visibleCells: ComputedRef<CalendarCell[]>
  /** content-координата левого края сетки для видимого окна */
  gridLeft: ComputedRef<number>
  /** Индексы видимых ячеек (виртуализированный рендер) */
  visibleIndices: ComputedRef<number[]>
  /** content-координата левого края ячейки i (абсолютный индекс) */
  cellLeft: (i: number) => number
  /** Дата начала ячейки i */
  cellStart: (i: number) => Date
  /** Дата конца ячейки i (включительно) */
  cellEnd: (i: number) => Date
  /** Дата под указателем (для контекст-меню) */
  dateAtPointer: (rect: DOMRect | null, clientX: number) => string | null
  /** Инициализация: стартовая позиция = origin у левого края шкалы */
  initialize: () => void
  /** Пересчёт окна и расширение диапазона (вызывается на scroll/resize) */
  sync: () => void
  /** Подписка на scroll + ResizeObserver */
  mount: () => void
  /** Отписка */
  unmount: () => void
}

/** Шаг расширения диапазона в ячейках: на столько растёт диапазон за раз,
 *  чтобы rebase при левой прокрутке происходил не на каждую ячейку */
function growStep(viewportCells: number): number {
  return Math.max(Math.ceil(viewportCells * 0.5), 12)
}

/**
 * Бесконечная горизонтальная шкала с динамическим расширением.
 * origin — дата-якорь (индекс ячейки 0). Слева/справа «материализуется» ровно
 * столько ячеек, сколько нужно для текущего положения; при приближении к краю
 * диапазон расширяется (справа — просто рост ширины, слева — компенсация scrollLeft,
 * поэтому картинка не сдвигается). Рендер ячеек виртуализирован (видимое окно).
 */
export function useInfiniteTimeline(
  origin: Date | string,
  unit: Ref<PlanningUnit>,
  container: Ref<HTMLElement | null>,
): InfiniteTimeline {
  const cellPx = ref(CELL_WIDTH)
  const leftPad = ref(0)
  const rightCells = ref(0)
  const windowStart = ref(0)
  const viewportWidth = ref(0)

  const viewportCells = computed(() =>
    Math.max(Math.ceil((viewportWidth.value - LABEL_WIDTH) / cellPx.value), 1),
  )
  const contentWidth = computed(() =>
    LABEL_WIDTH + (leftPad.value + rightCells.value) * cellPx.value,
  )
  const visibleCells = computed(() => {
    const from = windowStart.value
    const count = viewportCells.value + 2
    return windowCells(toDate(origin), unit.value, from, count)
  })
  /** Индексы видимых ячеек (для виртуализированного рендера) */
  const visibleIndices = computed(() => {
    const from = windowStart.value
    const count = viewportCells.value + 2
    const arr: number[] = []
    for (let k = 0; k < count; k++) arr.push(from + k)
    return arr
  })
  const gridLeft = computed(
    () => LABEL_WIDTH + (windowStart.value + leftPad.value) * cellPx.value,
  )

  function cellLeft(i: number): number {
    return LABEL_WIDTH + (i + leftPad.value) * cellPx.value
  }

  /** Дата начала ячейки i (свежий Date — безопасен для вызова методов) */
  function cellStart(i: number): Date {
    return cellStartDate(toDate(origin), unit.value, i)
  }

  /** Дата конца ячейки i (включительно) */
  function cellEnd(i: number): Date {
    return cellEndDate(toDate(origin), unit.value, i)
  }

  function dateAtPointer(rect: DOMRect | null, clientX: number): string | null {
    return dateForPointer(toDate(origin), unit.value, windowStart.value, cellPx.value, rect, clientX)
  }

  /** Обновляет ширину контейнера и cellPx из CSS-переменной */
  function measure() {
    const el = container.value
    if (!el) return
    viewportWidth.value = el.clientWidth
    const raw = getComputedStyle(el).getPropertyValue('--cell-width').trim()
    const px = raw ? parseFloat(raw) : CELL_WIDTH
    if (px > 0 && !Number.isNaN(px)) cellPx.value = px
  }

  function sync() {
    const el = container.value
    if (!el) return
    const scrollLeft = el.scrollLeft
    const vs = Math.floor(scrollLeft / cellPx.value - leftPad.value)
    windowStart.value = vs
    const step = growStep(viewportCells.value)
    const visibleEnd = vs + viewportCells.value + 1
    // Вправо: расширяем диапазон (ширина растёт, скроллбар утончается)
    if (visibleEnd + step > rightCells.value) {
      rightCells.value = visibleEnd + step
    }
    // Влево: расширяем + компенсируем scrollLeft, чтобы картинка не сдвинулась
    if (vs - step < -leftPad.value) {
      const delta = step * cellPx.value
      leftPad.value += step
      el.scrollLeft += delta
      windowStart.value = Math.floor(el.scrollLeft / cellPx.value - leftPad.value)
    }
  }

  function initialize() {
    measure()
    const step = growStep(viewportCells.value)
    leftPad.value = step
    rightCells.value = viewportCells.value + step * 2
    const el = container.value
    if (el) el.scrollLeft = leftPad.value * cellPx.value
    windowStart.value = 0
  }

  let observer: ResizeObserver | null = null

  function onScroll() {
    sync()
  }

  function mount() {
    const el = container.value
    if (!el) return
    initialize()
    // Ширина контента обновляется реактивно (leftPad/rightCells) — ждём применения
    // DOM, иначе scrollLeft зажимается в старую (нулевую) ширину и origin не встаёт у левого края.
    void nextTick().then(() => {
      el.scrollLeft = leftPad.value * cellPx.value
      windowStart.value = 0
    })
    observer = new ResizeObserver(() => {
      measure()
      sync()
    })
    observer.observe(el)
    el.addEventListener('scroll', onScroll, { passive: true })
  }

  function unmount() {
    observer?.disconnect()
    observer = null
    container.value?.removeEventListener('scroll', onScroll)
  }

  return {
    cellPx,
    windowStart,
    viewportCells,
    leftPad,
    contentWidth,
    visibleCells,
    visibleIndices,
    gridLeft,
    cellLeft,
    cellStart,
    cellEnd,
    dateAtPointer,
    initialize,
    sync,
    mount,
    unmount,
  }
}
