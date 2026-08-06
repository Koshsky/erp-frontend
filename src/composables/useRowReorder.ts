import { onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import { useWindowPointerTrack } from '../utils'

/**
 * Вертикальный драг строк группы (смена порядка): перенос по строкам только своей
 * группы (запросы скоупированы на groupEl — на странице может быть несколько .gg-group),
 * drop-line и индексы перестановки считаются по позиции курсора.
 */
export function useRowReorder(
  count: () => number,
  reorderable: () => boolean,
  groupEl: Ref<HTMLElement | null>,
  onReorder: (p: { from: number; to: number }) => void,
) {
  const draggingFrom = ref<number | null>(null)
  const dragTo = ref<number | null>(null)
  const dropStyle = ref<{ top: string } | null>(null)
  const rowDragCursor = ref(false)

  /** Строки только своей группы */
  function groupRows(): HTMLElement[] {
    return Array.from(groupEl.value?.querySelectorAll('.gg-row[data-row-index]') ?? [])
  }

  /** Целевой индекс вставки [0..n] по позиции курсора: число строк, середина которых выше курсора */
  function targetBoundary(clientY: number): number {
    const rows = groupRows()
    if (!rows.length) return 0
    let b = 0
    for (const el of rows) {
      const r = el.getBoundingClientRect()
      if (clientY > r.top + r.height / 2) b += 1
    }
    return b
  }

  function onRowDragMove(e: PointerEvent) {
    if (draggingFrom.value == null) return
    const rows = groupRows()
    const b = targetBoundary(e.clientY)
    const n = count()
    dragTo.value = b
    if (b === 0) {
      const first = rows[0]
      dropStyle.value = { top: (first?.offsetTop ?? 0) + 'px' }
    } else if (b >= n) {
      const last = rows[n - 1]
      dropStyle.value = { top: ((last?.offsetTop ?? 0) + (last?.offsetHeight ?? 0)) + 'px' }
    } else {
      const el = rows[b]
      dropStyle.value = { top: (el?.offsetTop ?? 0) + 'px' }
    }
  }

  function endRowDrag() {
    track.stop()
    rowDragCursor.value = false
    draggingFrom.value = null
    dragTo.value = null
    dropStyle.value = null
  }

  function onRowDragUp() {
    const from = draggingFrom.value
    const b = dragTo.value
    endRowDrag()
    if (from == null || b == null) return
    const n = count()
    const to = b > from ? b - 1 : b
    if (to >= 0 && to < n && to !== from) onReorder({ from, to })
  }

  function startRowDrag(e: PointerEvent, from: number) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return
    if (!reorderable() || count() < 2) return
    e.preventDefault()
    e.stopPropagation()
    draggingFrom.value = from
    dragTo.value = from
    rowDragCursor.value = true
    track.start()
  }

  const track = useWindowPointerTrack({
    onMove: onRowDragMove,
    onUp: onRowDragUp,
    onCancel: endRowDrag,
  })

  // Размонтирование посреди драга строки (смена данных/страницы): без этого
  // слушатели и userSelect=«none» остаются навсегда.
  onBeforeUnmount(endRowDrag)

  return { draggingFrom, dragTo, dropStyle, rowDragCursor, startRowDrag }
}
