export interface ContextMenuItem {
  id: string
  label: string
}

export interface ContextMenuProps {
  /** Видимость меню */
  open: boolean
  /** Позиция курсора (clientX / clientY) */
  x: number
  y: number
  items: ContextMenuItem[]
}
