import { computed, nextTick, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
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
import { ensureRange, growStep, readRootCellWidth, windowStartFor, type TimelineRange } from './timelineHelpers'
import { useTableState } from './useTableState'
import { useTimelineZoom } from './useTimelineZoom'

export interface InfiniteTimeline {
  /** Ширина ячейки в px (из CSS-переменной --cell-width, адаптивная) */
  cellPx: Ref<number>
  /** Масштаб таблицы (zoom на .tg-content): ячейки, строки, шрифты */
  tableScale: Ref<number>
  /** Счётчик изменений масштаба: инкрементируется на каждом зуме — сигнал для бейджа масштаба */
  scaleBump: Ref<number>
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

/**
 * Бесконечная горизонтальная шкала с динамическим расширением.
 * origin — дата-якорь (индекс ячейки 0). Слева/справа «материализуется» ровно
 * столько ячеек, сколько нужно для текущего положения; при приближении к краю
 * диапазон расширяется (справа — просто рост ширины, слева — компенсация scrollLeft,
 * поэтому картинка не сдвигается). Рендер ячеек виртуализирован (видимое окно).
 *
 * Масштабирование (zoomTo/applyTableScale/resetAll) и персист состояния вынесены
 * в useTimelineZoom и useTableState.
 */
export function useInfiniteTimeline(
  origin: Date | string,
  unit: Ref<PlanningUnit>,
  container: Ref<HTMLElement | null>,
  contentEl: Ref<HTMLElement | null>,
  /** Стабильный id таблицы: состояние (масштаб + прокрутка) сохраняется между монтированиями */
  id?: string,
): InfiniteTimeline {
  const cellPx = ref(CELL_WIDTH)
  const leftPad = ref(0)
  const rightCells = ref(0)
  const windowStart = ref(0)
  const viewportWidth = ref(0)
  const tableScale = ref(1)
  /** Инкрементируется при каждом реальном изменении масштаба (зум/сброс) */
  const scaleBump = ref(0)

  const viewportCells = computed(() =>
    Math.max(
      Math.ceil((viewportWidth.value / tableScale.value - LABEL_WIDTH) / cellPx.value),
      1,
    ),
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

  const range: TimelineRange = { leftPad, rightCells, cellPx, viewportCells }

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
    return dateForPointer(
      toDate(origin),
      unit.value,
      windowStart.value,
      cellPx.value,
      rect,
      clientX,
      tableScale.value,
    )
  }

  const tableState = useTableState()
  const zoom = useTimelineZoom({
    container,
    contentEl,
    cellPx,
    leftPad,
    rightCells,
    windowStart,
    tableScale,
    scaleBump,
    viewportCells,
    sync,
  })

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
    const scale = tableScale.value
    // scrollLeft — в масштабированных px: локальные = визуальные / scale
    const scrollLeft = el.scrollLeft / scale
    const vs = windowStartFor(scrollLeft, cellPx.value, leftPad.value)
    windowStart.value = vs
    // Вправо: расширяем диапазон (ширина растёт, скроллбар утончается);
    // влево: расширяем + компенсируем scrollLeft, чтобы картинка не сдвинулась.
    ensureRange(vs, range, (step) => {
      el.scrollLeft += step * cellPx.value * scale
    })
    windowStart.value = windowStartFor(el.scrollLeft / scale, cellPx.value, leftPad.value)
  }

  function initialize() {
    // Восстановление сохранённого состояния (масштаб) до measure(),
    // чтобы measure() подхватил сохранённый --cell-width из computed style.
    const stored = tableState.get(id)
    const el0 = container.value
    if (stored && el0) {
      cellPx.value = stored.cellPx
      // Инлайн --cell-width ставим только при отличии от адаптивного дефолта из
      // :root — иначе «сброшенный» масштаб заморозится и перестанет реагировать на resize.
      if (Math.abs(stored.cellPx - readRootCellWidth()) > 0.5) {
        el0.style.setProperty('--cell-width', stored.cellPx + 'px')
      }
      tableScale.value = stored.scale
      if (contentEl.value) contentEl.value.style.zoom = String(stored.scale)
    }
    measure()
    const step = growStep(viewportCells.value)
    leftPad.value = step
    rightCells.value = viewportCells.value + step * 2
    // Расширяем диапазон под сохранённый scrollLeft сразу (до flush), иначе
    // браузер зажмёт scrollLeft в меньшую ширину контента и позиция потеряется.
    if (stored) {
      const local = stored.scrollLeft / tableScale.value
      const vs = windowStartFor(local, cellPx.value, leftPad.value)
      ensureRange(vs, range)
    }
    const el = container.value
    if (el) el.scrollLeft = leftPad.value * cellPx.value
    windowStart.value = 0
  }

  let observer: ResizeObserver | null = null

  /** Рестор scrollLeft/scrollTop применён (иначе unmount перезапишет хранилище дефолтом) */
  let stateReady = false

  function onScroll() {
    sync()
  }

  function mount() {
    const el = container.value
    if (!el) return
    initialize()
    const stored = tableState.get(id)
    // Ширина контента обновляется реактивно (leftPad/rightCells) — ждём применения
    // DOM, иначе scrollLeft зажимается в старую (нулевую) ширину и origin не встаёт у левого края.
    void nextTick().then(() => {
      if (stored) {
        el.scrollLeft = stored.scrollLeft
        el.scrollTop = stored.scrollTop
        sync()
      } else {
        el.scrollLeft = leftPad.value * cellPx.value
        windowStart.value = 0
      }
      stateReady = true
    })
    observer = new ResizeObserver(() => {
      measure()
      sync()
    })
    observer.observe(el)
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', zoom.onWheel, { passive: false })
    el.addEventListener('dblclick', zoom.onDblClick)
  }

  function unmount() {
    observer?.disconnect()
    observer = null
    const el = container.value
    // Если рестор не успел примениться (быстрое перемонтирование из-за
    // loading-флипа), состояние в хранилище ещё валидно — не затираем его.
    if (id && el && stateReady) {
      tableState.save(id, {
        cellPx: cellPx.value,
        scale: tableScale.value,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      })
    }
    stateReady = false
    el?.removeEventListener('scroll', onScroll)
    el?.removeEventListener('wheel', zoom.onWheel)
    el?.removeEventListener('dblclick', zoom.onDblClick)
  }

  return {
    cellPx,
    tableScale,
    scaleBump,
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
