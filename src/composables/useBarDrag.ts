import { onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import type { CellSpan } from '../components/planner/calendar'
import type { TimelineCtx } from './useInfiniteTimeline'
import { LABEL_WIDTH } from '../components/planner/layout'

export type BarDragMode = 'move' | 'resizeStart' | 'resizeEnd'

export interface UseBarDragOptions {
  /** Текущий контекст бесконечной шкалы (reactive, читается на каждом move) */
  timeline: () => TimelineCtx
  /** Скролл-контейнер шкалы (для rect → ячейка и автопрокрутки) */
  scrollEl: () => HTMLElement | null
  /** Пересчёт окна + расширение диапазона после программной прокрутки */
  sync: () => void
  /** Текущий диапазон ячеек бара (абсолютные индексы) */
  getSpan: () => CellSpan | null
  /** Допустимый диапазон ячеек — границы родителя (абсолютные). null = без границ */
  getBounds?: () => CellSpan | null
  /** Вызывается на отпускание, если диапазон изменился */
  onCommit: (span: CellSpan) => void
}

export interface BarDrag {
  isDragging: Ref<boolean>
  cursor: Ref<'grabbing' | 'ew-resize' | null>
  previewStyle: Ref<Record<string, string | number> | null>
  startDrag: (e: PointerEvent, mode: BarDragMode) => void
}

const EDGE_MARGIN = 48
const SCROLL_SPEED = 28

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/**
 * Драг бара в бесконечной шкале: движение переводится в абсолютные ячейки через
 * ячейку под курсором (учитывает автопрокрутку), диапазон зажимается в границы
 * родителя. У края контейнера включается автопрокрутка (rAF-цикл), которая
 * двигает скролл и расширяет диапазон шкалы.
 */
export function useBarDrag(options: UseBarDragOptions): BarDrag {
  const isDragging = ref(false)
  const cursor = ref<'grabbing' | 'ew-resize' | null>(null)
  const previewStyle = ref<Record<string, string | number> | null>(null)

  let mode: BarDragMode | null = null
  let startPointerCell = 0
  let startSpan: CellSpan | null = null
  let dragSpan: CellSpan | null = null
  let lastClientX = 0
  let rafId: number | null = null
  let scrollDir = 0

  function currentPointerCell(clientX: number): number {
    const t = options.timeline()
    const el = options.scrollEl()
    if (!el) return startPointerCell
    const rect = el.getBoundingClientRect()
    return t.windowStart + ((clientX - rect.left) / t.scale - LABEL_WIDTH) / t.cellPx
  }

  function computeSpan(clientX: number) {
    const t = options.timeline()
    if (!mode || !startSpan) return
    const delta = currentPointerCell(clientX) - startPointerCell

    const bounds = options.getBounds?.() ?? null
    let bMin = -Infinity
    let bMax = Infinity
    if (bounds) {
      bMin = bounds.startCell
      bMax = Math.max(bounds.endCell, bMin + 1)
    }

    let s = startSpan.startCell
    let end = startSpan.endCell
    if (mode === 'move') {
      const width = startSpan.endCell - startSpan.startCell
      s = Math.round(startSpan.startCell + delta)
      s = clamp(s, bMin, Math.max(bMin, bMax - width))
      end = Math.min(s + width, bMax)
    } else if (mode === 'resizeStart') {
      s = clamp(Math.round(startSpan.startCell + delta), bMin, Math.max(bMin, end - 1))
    } else {
      end = clamp(Math.round(startSpan.endCell + delta), Math.min(bMax, s + 1), bMax)
    }

    s = clamp(s, bMin, Math.max(bMin, bMax - 1))
    end = clamp(end, Math.min(bMax, s + 1), bMax)
    dragSpan = { startCell: s, endCell: end }
    previewStyle.value = {
      left: t.cellLeft(s) + 'px',
      width: (end - s) * t.cellPx + 'px',
    }
  }

  function autoscrollFrame() {
    const el = options.scrollEl()
    if (!el || scrollDir === 0) return
    el.scrollLeft += scrollDir * SCROLL_SPEED
    options.sync()
    computeSpan(lastClientX)
    rafId = requestAnimationFrame(autoscrollFrame)
  }

  function updateAutoscroll(clientX: number) {
    const el = options.scrollEl()
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dir = clientX < rect.left + EDGE_MARGIN ? -1 : clientX > rect.right - EDGE_MARGIN ? 1 : 0
    if (dir === scrollDir) return
    scrollDir = dir
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = dir === 0 ? null : requestAnimationFrame(autoscrollFrame)
  }

  function stopAutoscroll() {
    scrollDir = 0
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = null
  }

  function onMove(e: PointerEvent) {
    lastClientX = e.clientX
    computeSpan(e.clientX)
    updateAutoscroll(e.clientX)
  }

  function onUp() {
    const span = dragSpan
    const changed =
      span != null &&
      startSpan != null &&
      (span.startCell !== startSpan.startCell || span.endCell !== startSpan.endCell)
    endDrag()
    if (changed && span) options.onCommit({ ...span })
  }

  function endDrag() {
    stopAutoscroll()
    mode = null
    startSpan = null
    dragSpan = null
    isDragging.value = false
    cursor.value = null
    previewStyle.value = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', endDrag)
    document.body.style.userSelect = ''
  }

  function startDrag(e: PointerEvent, m: BarDragMode) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return
    const span = options.getSpan()
    if (!span) return
    e.preventDefault()
    mode = m
    lastClientX = e.clientX
    startPointerCell = currentPointerCell(e.clientX)
    startSpan = { ...span }
    dragSpan = { ...span }
    isDragging.value = true
    cursor.value = m === 'move' ? 'grabbing' : 'ew-resize'
    previewStyle.value = null
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', endDrag)
  }

  // Компонент мог размонтироваться посреди драга (смена данных/страницы):
  // без этого слушатели и userSelect=«none» остаются навсегда.
  onBeforeUnmount(endDrag)

  return { isDragging, cursor, previewStyle, startDrag }
}
