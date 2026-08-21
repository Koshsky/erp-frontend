import { computed, inject } from 'vue'
import { cellRangeForSpan } from '../components/planner/calendar'
import type { CellSpan } from '../components/planner/calendar'
import { useBarDrag } from './useBarDrag'
import {
  TimelineScrollKey,
  TimelineSyncKey,
  type TimelineCtx,
} from './timeline-context'

export interface UseTimelineItemOptions {
  /** Текущий контекст бесконечной шкалы (reactive; читается на каждом пересчёте) */
  timeline: () => TimelineCtx
  /** Границы родителя для зажима драга */
  groupStartDate?: Date | string | number | null
  groupEndDate?: Date | string | number | null
  /** Текущий диапазон ячеек элемента (абсолютные индексы) */
  getSpan: () => CellSpan | null
  /** Подтверждение драга: новый диапазон ячеек */
  onCommit: (span: CellSpan) => void
}

/**
 * Общая обвязка элемента шкалы (бар/веха): инъекция скролл-контейнера и sync,
 * границы родителя, видимость в окне (±запас) и клей к useBarDrag.
 */
export function useTimelineItem(options: UseTimelineItemOptions) {
  const scrollEl = inject(TimelineScrollKey, null)
  const timelineSync = inject(TimelineSyncKey, () => {})

  const bounds = computed(() =>
    options.groupStartDate != null && options.groupEndDate != null
      ? cellRangeForSpan(
          options.timeline().origin,
          options.timeline().unit,
          options.groupStartDate,
          options.groupEndDate,
        )
      : null,
  )

  /** Элемент скрывается, если его спана не пересекает видимое окно (±запас) */
  const visible = computed(() => {
    const span = options.getSpan()
    if (!span) return false
    const t = options.timeline()
    return (
      span.endCell > t.windowStart - 4 && span.startCell < t.windowStart + t.viewportCells + 4
    )
  })

  const { isDragging, cursor, previewStyle, dragSpan, startDrag } = useBarDrag({
    timeline: options.timeline,
    scrollEl: () => scrollEl?.value ?? null,
    sync: timelineSync,
    getSpan: options.getSpan,
    getBounds: () => bounds.value,
    onCommit: options.onCommit,
  })

  return { scrollEl, timelineSync, bounds, visible, isDragging, cursor, previewStyle, dragSpan, startDrag }
}
