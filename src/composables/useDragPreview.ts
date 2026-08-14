import { inject, provide } from 'vue'
import type { InjectionKey, Ref } from 'vue'

/**
 * Активный драг задачи для live-предпросмотра загрузки ресурсов:
 * ResourceHeader красит ячейки так, как будто задача уже лежит на новом месте.
 * Пишется из TaskBar (на dragstart/dragmove/dragend бара), читается в TaskPlanning
 * через обёртку usageForDay → usagePreview.
 */
export interface DragPreviewState {
  /** Идёт ли сейчас перетаскивание задачи */
  active: boolean
  /** id перетаскиваемой задачи (для поиска старых дат и ресурсов в displayProcesses) */
  taskId: number | null
  /** Предложенные новые даты (span бара во время драга) */
  startDate: string | null
  endDate: string | null
}

export const DragPreviewKey: InjectionKey<Ref<DragPreviewState>> = Symbol('drag-preview')

/** Получить текущий drag-preview (null, если провайдер не подключён) */
export function useDragPreview(): Ref<DragPreviewState> | null {
  return inject(DragPreviewKey, null)
}

/** Зарегистрировать drag-preview (в TaskPlanning) */
export function provideDragPreview(state: Ref<DragPreviewState>): void {
  provide(DragPreviewKey, state)
}
