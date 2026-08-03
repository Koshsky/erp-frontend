import { ref } from 'vue'
import type { Ref } from 'vue'
import type { CalendarCell, CellSpan } from '../components/planner/calendar'

export type BarDragMode = 'move' | 'resizeStart' | 'resizeEnd'

export interface UseBarDragOptions {
  /** Актуальный список ячеек шкалы (anchor/mode/unit текущие) */
  cells: () => CalendarCell[]
  /** Родительский контейнер бара (position: relative), его ширина = вся шкала */
  getContainer: () => HTMLElement | null
  /** Текущий диапазон ячеек бара */
  getSpan: () => CellSpan | null
  /**
   * Допустимый диапазон ячеек [start, end) — границы родителя (процесса/проекта).
   * null означает, что границы не заданы и драг ограничивается только шкалой.
   */
  getBounds?: () => CellSpan | null
  /** Вызывается на отпускание, если диапазон изменился */
  onCommit: (span: CellSpan) => void
}

export interface BarDrag {
  isDragging: Ref<boolean>
  /** Курсор во время и в ожидании драга (ew-resize у ручек задаётся в компоненте) */
  cursor: Ref<'grabbing' | 'ew-resize' | null>
  /** Локальный стиль бара во время драга (px-координаты вместо %) */
  previewStyle: Ref<Record<string, string | number> | null>
  startDrag: (e: PointerEvent, mode: BarDragMode) => void
}

/**
 * Драг бара ганта без библиотек: Pointer Events + слушатели на window.
 * Движение по горизонтали переводится в смещение в ячейках с привязкой к целым
 * ячейкам; диапазон зажимается в границы (intersection границ родителя со
 * шкалой [0, total]) с минимумом в одну ячейку. При move ширина сохраняется,
 * при ресайзе растянутый край упирается в границу; если бар в целом шире
 * границ родителя — он сжимается до их размеров. Итоговая спана всегда
 * целиком лежит в границах, поэтому на коммит не уходит диапазон вне родителя.
 * Во время драга барам задаётся previewStyle (px), на отпускание вызывается
 * onCommit с новым диапазоном ячеек.
 */
export function useBarDrag(options: UseBarDragOptions): BarDrag {
  const isDragging = ref(false)
  const cursor = ref<'grabbing' | 'ew-resize' | null>(null)
  const previewStyle = ref<Record<string, string | number> | null>(null)

  let mode: BarDragMode | null = null
  let startX = 0
  let startSpan: CellSpan | null = null
  let containerWidth = 0
  let totalCells = 0
  let dragSpan: CellSpan | null = null

  function clamp(v: number, min: number, max: number): number {
    return Math.min(Math.max(v, min), max)
  }

  function onMove(e: PointerEvent) {
    if (!mode || !startSpan || totalCells <= 0 || containerWidth <= 0) return
    const cellPx = containerWidth / totalCells
    const delta = Math.round((e.clientX - startX) / cellPx)

    let bMin = 0
    let bMax = totalCells
    const bounds = options.getBounds?.() ?? null
    if (bounds) {
      bMin = clamp(Math.max(bounds.startCell, 0), 0, totalCells - 1)
      bMax = clamp(Math.min(bounds.endCell, totalCells), 1, totalCells)
      if (bMax <= bMin) bMax = bMin + 1
    }

    let s = startSpan.startCell
    let end = startSpan.endCell
    if (mode === 'move') {
      const width = startSpan.endCell - startSpan.startCell
      s = clamp(startSpan.startCell + delta, bMin, Math.max(bMin, bMax - width))
      end = Math.min(s + width, bMax)
    } else if (mode === 'resizeStart') {
      s = clamp(startSpan.startCell + delta, bMin, Math.max(bMin, end - 1))
    } else {
      end = clamp(startSpan.endCell + delta, Math.min(bMax, s + 1), bMax)
    }

    // Финальная усадка спана целиком в границы (оба края, минимум 1 ячейка):
    // зафиксированный при ресайзе край не должен вылезать за границы родителя,
    // иначе на коммит (и в API) уйдёт диапазон вне родителя. Бар шире границ
    // при этом сжимается до размеров родителя.
    s = clamp(s, bMin, Math.max(bMin, bMax - 1))
    end = clamp(end, Math.min(bMax, s + 1), bMax)
    dragSpan = { startCell: s, endCell: end }
    previewStyle.value = {
      left: (s / totalCells) * containerWidth + 'px',
      width: ((end - s) / totalCells) * containerWidth + 'px',
    }
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
    mode = null
    startSpan = null
    dragSpan = null
    containerWidth = 0
    totalCells = 0
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
    const container = options.getContainer()
    const span = options.getSpan()
    if (!container || !span) return
    const cells = options.cells()
    if (!cells.length) return
    e.preventDefault()
    mode = m
    startX = e.clientX
    startSpan = { ...span }
    containerWidth = container.getBoundingClientRect().width
    totalCells = cells.length
    dragSpan = { ...span }
    isDragging.value = true
    cursor.value = m === 'move' ? 'grabbing' : 'ew-resize'
    previewStyle.value = null
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', endDrag)
  }

  return { isDragging, cursor, previewStyle, startDrag }
}
