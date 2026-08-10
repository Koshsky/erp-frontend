import { nextTick } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { LABEL_WIDTH } from '../components/planner/layout'
import { clamp } from '../utils'
import { DBLCLICK_IGNORE_SELECTOR } from './timeline-context'
import {
  ensureRange,
  readRootCellWidth,
  windowStartFor,
  type TimelineRange,
} from './timelineHelpers'

/** Верхняя граница зума ширины ячейки (px). Минимум не ограничен —
 *  ячейки могут сжиматься как угодно (технический пол 1px). */
const ZOOM_MAX = 100
/** Границы CSS-зума таблицы (zoom на .tg-content) */
const SCALE_MIN = 0.5
const SCALE_MAX = 2

export interface TimelineZoomOptions {
  container: Ref<HTMLElement | null>
  contentEl: Ref<HTMLElement | null>
  cellPx: Ref<number>
  leftPad: Ref<number>
  rightCells: Ref<number>
  windowStart: Ref<number>
  tableScale: Ref<number>
  scaleBump: Ref<number>
  viewportCells: ComputedRef<number>
  sync: () => void
}

/**
 * Зум бесконечной шкалы: два независимых масштаба — общий CSS-zoom таблицы
 * (applyTableScale) и ширина ячейки (zoomTo). Оба центрируются на точке под
 * курсором; диапазон расширяется сразу по новой шкале, чтобы scrollLeft не
 * зажался в старую ширину контента. Ctrl+колесо — общий зум, Ctrl+Shift —
 * ширина ячейки, двойной клик — сброс.
 */
export function useTimelineZoom(opts: TimelineZoomOptions) {
  const { container, contentEl, cellPx, leftPad, rightCells, windowStart, tableScale, scaleBump, viewportCells, sync } = opts
  const range: TimelineRange = { leftPad, rightCells, cellPx, viewportCells }

  /**
   * Зум ширины ячейки (только горизонтальный масштаб): меняет ширину ячейки,
   * оставляя ячейку под anchorX (локальная, немасштабированная координата внутри
   * контейнера) на месте — курсор — центр зума.
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
    const vs = windowStartFor(nsl, px, leftPad.value)
    ensureRange(vs, range, (step) => {
      nsl += step * px
    })
    windowStart.value = windowStartFor(nsl, px, leftPad.value)
    void nextTick().then(() => {
      el.scrollLeft = nsl * tableScale.value
      sync()
    })
  }

  /**
   * Масштабирование таблицы целиком (ячейки, строки, шрифты, бары) CSS-zoom'ом
   * на .tg-content. Якорь зума: по горизонтали — точка под курсором (vpX),
   * по вертикали — самый верх контейнера (scrollTop масштабируется, верхний край
   * остаётся на месте). scrollLeft/scrollTop — в масштабированных px.
   */
  function applyTableScale(newScale: number, vpX: number) {
    const el = container.value
    if (!el) return
    const s = clamp(newScale, SCALE_MIN, SCALE_MAX)
    if (s === tableScale.value) return
    const old = tableScale.value
    scaleBump.value++
    // Локальные content-координаты под курсором (в px) до смены масштаба;
    // по вертикали якорь — верх контейнера (y = scrollTop/old), не курсор.
    const x = (el.scrollLeft + vpX) / old
    const y = el.scrollTop / old
    tableScale.value = s
    if (contentEl.value) contentEl.value.style.zoom = String(s)
    // Новые scrollLeft/scrollTop в масштабированных px, чтобы якорь
    // (мышь по X, верх по Y) не сдвинулся.
    let nsl = x * s - vpX
    const nst = y * s
    // Расширяем диапазон под новый scrollLeft до flush, иначе браузер зажмёт
    // его в меньшую ширину контента и якорь потеряется.
    const vs = windowStartFor(nsl / s, cellPx.value, leftPad.value)
    ensureRange(vs, range, (step) => {
      nsl += step * cellPx.value * s
    })
    windowStart.value = windowStartFor(nsl / s, cellPx.value, leftPad.value)
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
    const px = readRootCellWidth()
    cellPx.value = px
    el.style.removeProperty('--cell-width')
    tableScale.value = 1
    scaleBump.value++
    if (contentEl.value) contentEl.value.style.zoom = ''
    let nsl = LABEL_WIDTH + (cellFloat + leftPad.value) * px - anchorLocal
    const vs = windowStartFor(nsl, px, leftPad.value)
    ensureRange(vs, range, (step) => {
      nsl += step * px
    })
    windowStart.value = windowStartFor(nsl, px, leftPad.value)
    void nextTick().then(() => {
      el.scrollLeft = nsl
      sync()
    })
  }

  /**
   * Ctrl+колесо — масштабирование всей таблицы вокруг курсора (якорь по X — мышь,
   * по Y — верх контейнера); Ctrl+Shift+колесо — зум ширины ячеек вокруг курсора;
   * иначе обычная прокрутка.
   */
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    const el = container.value
    if (!el) return
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    const vpX = e.clientX - rect.left
    // Шаг зума: ровно ±10% на один щелчок колеса (deltaY = 120), не более 10% за событие
    const factor = Math.pow(1.1, clamp(e.deltaY / 120, -1, 1))
    if (e.shiftKey) {
      const local = clamp(vpX / tableScale.value, LABEL_WIDTH, rect.width / tableScale.value)
      zoomTo(cellPx.value * factor, local)
      return
    }
    applyTableScale(tableScale.value * factor, vpX)
  }

  /** Двойной клик по пустому месту шкалы — сброс обоих масштабов */
  function onDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest(DBLCLICK_IGNORE_SELECTOR)) {
      return
    }
    const el = container.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    resetAll(e.clientX - rect.left)
  }

  return { zoomTo, applyTableScale, resetAll, onWheel, onDblClick }
}
