export interface CopyFieldProps {
  /** Значение для отображения и копирования */
  value: string
  /** Подпись над полем */
  label?: string
  /** Моноширинный шрифт (для паролей/логинов) */
  monospace?: boolean
  /** Подпись/aria кнопки копирования */
  copyLabel?: string
}
