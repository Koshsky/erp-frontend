export interface ContextMenuItem {
  id: string
  label: string
  /** Активный (текущий) пункт — подсвечивается, например выбранный масштаб шкалы */
  active?: boolean
}

export interface ContextMenuProps {
  /** Видимость меню */
  open: boolean
  /** Позиция курсора (clientX / clientY) */
  x: number
  y: number
  items: ContextMenuItem[]
}
