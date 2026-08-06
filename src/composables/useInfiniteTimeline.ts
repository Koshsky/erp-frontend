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
import { clamp } from '../utils'
import { INTERACTIVE_SELECTOR, TimelineScrollKey, TimelineSyncKey } from './timeline-context'
import type { TimelineCtx } from './timeline-context'

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

/** Шаг расширения диапазона в ячейках: на столько растёт диапазон за раз,
 *  чтобы rebase при левой прокрутке происходил не на каждую ячейку */
function growStep(viewportCells: number): number {
  return Math.max(Math.ceil(viewportCells * 0.5), 12)
}

/** Верхняя граница зума ширины ячейки (px). Минимум не ограничен —
 *  ячейки могут сжиматься как угодно (технический пол 1px). */
const ZOOM_MAX = 100

/** Границы CSS-зума таблицы (zoom на .tg-content) */
const SCALE_MIN = 0.5
const SCALE_MAX = 2

/** Состояние масштаба/прокрутки одной таблицы (сохраняется при размонтировании) */
interface TableScaleState {
  /** Ширина ячейки в px (--cell-width) */
  cellPx: number
  /** Масштаб таблицы (zoom на .tg-content) */
  scale: number
  /** Горизонтальная прокрутка (в масштабированных px) */
  scrollLeft: number
  /** Вертикальная прокрутка */
  scrollTop: number
}

/**
 * In-memory хранилище состояния таблиц по id: переживает размонтирование
 * (переключение вкладок), но сбрасывается перезагрузкой страницы.
 */
const tableStates = new Map<string, TableScaleState>()

/**
 * Бесконечная горизонтальная шкала с динамическим расширением.
 * origin — дата-якорь (индекс ячейки 0). Слева/справа «материализуется» ровно
 * столько ячеек, сколько нужно для текущего положения; при приближении к краю
 * диапазон расширяется (справа — просто рост ширины, слева — компенсация scrollLeft,
 * поэтому картинка не сдвигается). Рендер ячеек виртуализирован (видимое окно).
 *
 * Масштабирование: окно (.tg-scroll) всегда занимает всё доступное место; масштаб
 * применяется CSS-zoom'ом на контент (.tg-content, параметр contentEl) — вместе с
 * ячейками масштабируются строки, шапка и шрифты, а липкие колонки продолжают
 * прилипать. Оба зума (общий и ширины ячеек) центрируются на точке под курсором;
 * scrollLeft хранится в масштабированных px, локальные координаты контента =
 * визуальные / scale. Все чтения/записи scrollLeft конвертируются.
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
      el.scrollLeft += delta * scale
      windowStart.value = Math.floor(el.scrollLeft / scale / cellPx.value - leftPad.value)
    }
  }

  /**
   * Зум ширины ячейки (только горизонтальный масштаб): меняет ширину ячейки,
   * оставляя ячейку под anchorX (локальная, немасштабированная координата внутри
   * контейнера) на месте — курсор — центр зума. Диапазон (leftPad/rightCells)
   * расширяется сразу по новой шкале, чтобы scrollLeft не зажался в старую
   * ширину контента.
   */
  function zoomTo(newPx: number, anchorX: number, persist = true) {
    const el = container.value
    if (!el) return
    const px = clamp(newPx, 1, ZOOM_MAX)
    if (px === cellPx.value) return
    const oldPx = cellPx.value
    const scale = tableScale.value
    const cellFloat =
      (el.scrollLeft / scale + anchorX - LABEL_WIDTH) / oldPx - leftPad.value
    cellPx.value = px
    if (persist) {
      el.style.setProperty('--cell-width', px + 'px')
    } else {
      el.style.removeProperty('--cell-width')
    }
    let nsl = LABEL_WIDTH + (cellFloat + leftPad.value) * px - anchorX
    const vs = Math.floor(nsl / px - leftPad.value)
    const step = growStep(viewportCells.value)
    const visibleEnd = vs + viewportCells.value + 1
    if (visibleEnd + step > rightCells.value) rightCells.value = visibleEnd + step
    if (vs - step < -leftPad.value) {
      leftPad.value += step
      nsl += step * px
    }
    windowStart.value = Math.floor(nsl / px - leftPad.value)
    void nextTick().then(() => {
      el.scrollLeft = nsl * tableScale.value
      sync()
    })
  }

  /**
   * Масштабирование таблицы целиком (ячейки, строки, шрифты, бары) CSS-zoom'ом
   * на .tg-content. Окно .tg-scroll при этом не меняется (всегда во весь экран);
   * точка под курсором (vpX/vpY — визуальные px-координаты внутри контейнера)
   * остаётся на месте — курсор — центр зума по горизонтали и вертикали.
   * scrollLeft/scrollTop задаются в масштабированных px; локальные координаты
   * контента = визуальные / scale (деление выполняется в dateForPointer,
   * useBarDrag и якоре Ctrl+Shift-зума).
   */
  function applyTableScale(newScale: number, vpX: number, vpY: number) {
    const el = container.value
    if (!el) return
    const s = clamp(newScale, SCALE_MIN, SCALE_MAX)
    if (s === tableScale.value) return
    const old = tableScale.value
    scaleBump.value++
    // Локальные content-координаты под курсором (в px) до смены масштаба
    const x = (el.scrollLeft + vpX) / old
    const y = (el.scrollTop + vpY) / old
    tableScale.value = s
    if (contentEl.value) contentEl.value.style.zoom = String(s)
    // Новые scrollLeft/scrollTop в масштабированных px, чтобы точка под
    // курсором не сдвинулась.
    let nsl = x * s - vpX
    const nst = y * s - vpY
    // Расширяем диапазон под новый scrollLeft до flush, иначе браузер зажмёт
    // его в меньшую ширину контента и якорь потеряется.
    const vs = Math.floor(nsl / s / cellPx.value - leftPad.value)
    const step = growStep(viewportCells.value)
    const visibleEnd = vs + viewportCells.value + 1
    if (visibleEnd + step > rightCells.value) rightCells.value = visibleEnd + step
    if (vs - step < -leftPad.value) {
      leftPad.value += step
      nsl += step * cellPx.value * s
    }
    windowStart.value = Math.floor(nsl / s / cellPx.value - leftPad.value)
    void nextTick().then(() => {
      el.scrollLeft = nsl
      el.scrollTop = nst
      sync()
    })
  }

  /**
   * Сброс к начальным масштабам (scale → 1, ширина ячейки → адаптивный дефолт
   * из :root --cell-width); точка под курсором неподвижна.
   */
  function resetAll(vpX: number) {
    const el = container.value
    if (!el) return
    const scale = tableScale.value
    const anchorLocal = clamp(vpX / scale, LABEL_WIDTH, el.clientWidth / scale)
    const oldPx = cellPx.value
    const cellFloat =
      (el.scrollLeft / scale + anchorLocal - LABEL_WIDTH) / oldPx - leftPad.value
    const rootVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--cell-width')
      .trim()
    const rootPx = rootVar ? parseFloat(rootVar) : CELL_WIDTH
    const px = Number.isFinite(rootPx) && rootPx > 0 ? rootPx : CELL_WIDTH
    cellPx.value = px
    el.style.removeProperty('--cell-width')
    tableScale.value = 1
    scaleBump.value++
    if (contentEl.value) contentEl.value.style.zoom = ''
    let nsl = LABEL_WIDTH + (cellFloat + leftPad.value) * px - anchorLocal
    const vs = Math.floor(nsl / px - leftPad.value)
    const step = growStep(viewportCells.value)
    const visibleEnd = vs + viewportCells.value + 1
    if (visibleEnd + step > rightCells.value) rightCells.value = visibleEnd + step
    if (vs - step < -leftPad.value) {
      leftPad.value += step
      nsl += step * px
    }
    windowStart.value = Math.floor(nsl / px - leftPad.value)
    void nextTick().then(() => {
      el.scrollLeft = nsl
      sync()
    })
  }

  /**
   * Ctrl+колесо — масштабирование всей таблицы вокруг курсора;
   * Ctrl+Shift+колесо — зум ширины ячеек вокруг курсора; иначе обычная прокрутка.
   */
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    const el = container.value
    if (!el) return
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    const vpX = e.clientX - rect.left
    const vpY = e.clientY - rect.top
    // Шаг зума: ровно ±10% на один щелчок колеса (deltaY = 120), не более 10% за событие
    const factor = Math.pow(1.1, clamp(e.deltaY / 120, -1, 1))
    if (e.shiftKey) {
      const local = clamp(vpX / tableScale.value, LABEL_WIDTH, rect.width / tableScale.value)
      zoomTo(cellPx.value * factor, local)
      return
    }
    applyTableScale(tableScale.value * factor, vpX, vpY)
  }

  /** Двойной клик по пустому месту шкалы — сброс обоих масштабов */
  function onDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest(INTERACTIVE_SELECTOR + ', .tg-head')) {
      return
    }
    const el = container.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    resetAll(e.clientX - rect.left)
  }

  function initialize() {
    // Восстановление сохранённого состояния (масштаб) до measure(),
    // чтобы measure() подхватил сохранённый --cell-width из computed style.
    const stored = id ? tableStates.get(id) : undefined
    const el0 = container.value
    if (stored && el0) {
      cellPx.value = stored.cellPx
      // Инлайн --cell-width ставим только при отличии от адаптивного дефолта из
      // :root — иначе «сброшенный» масштаб заморозится и перестанет реагировать на resize.
      const rootVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--cell-width')
        .trim()
      const rootPx = rootVar ? parseFloat(rootVar) : CELL_WIDTH
      if (Math.abs(stored.cellPx - (Number.isFinite(rootPx) && rootPx > 0 ? rootPx : CELL_WIDTH)) > 0.5) {
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
      const vs = Math.floor(local / cellPx.value - leftPad.value)
      const visibleEnd = vs + viewportCells.value + 1
      if (visibleEnd + step > rightCells.value) rightCells.value = visibleEnd + step
      if (vs - step < -leftPad.value) leftPad.value += step
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
    const stored = id ? tableStates.get(id) : undefined
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
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('dblclick', onDblClick)
  }

  function unmount() {
    observer?.disconnect()
    observer = null
    const el = container.value
    // Если рестор не успел примениться (быстрое перемонтирование из-за
    // loading-флипа), состояние в хранилище ещё валидно — не затираем его.
    if (id && el && stateReady) {
      tableStates.set(id, {
        cellPx: cellPx.value,
        scale: tableScale.value,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      })
    }
    stateReady = false
    el?.removeEventListener('scroll', onScroll)
    el?.removeEventListener('wheel', onWheel)
    el?.removeEventListener('dblclick', onDblClick)
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
