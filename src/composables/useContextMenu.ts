import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { ContextMenuItem, ContextMenuProps } from '../components/common/ContextMenu'

/** Базовое состояние меню: координаты; страница расширяет своими id-полями */
export interface ContextMenuState {
  x: number
  y: number
}

/**
 * Меню-машина ПКМ: состояние + готовые пропсы для <ContextMenu>.
 * menu — внешний ref (страница может строить items по его полям), items —
 * реактивный список пунктов, onSelect — обработчик выбора (читает menu.value
 * и диспатчит по id; закрытие меню происходит автоматически).
 */
export function useContextMenu<T extends ContextMenuState>(
  menu: Ref<T | null>,
  items: ComputedRef<ContextMenuItem[]>,
  onSelect: (id: string) => void,
) {
  function open(state: T) {
    menu.value = state
  }

  function close() {
    menu.value = null
  }

  function select(id: string) {
    onSelect(id)
    close()
  }

  const bind = computed<ContextMenuProps>(() => ({
    open: !!menu.value,
    x: menu.value?.x ?? 0,
    y: menu.value?.y ?? 0,
    items: items.value,
  }))

  return { open, close, select, bind }
}
