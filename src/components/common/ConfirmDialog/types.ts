export interface ConfirmDialogProps {
  /** Видимость диалога */
  open: boolean
  /** Заголовок окна */
  title?: string
  /** Текст подтверждения (что именно удаляем) */
  message: string
  /** Текст кнопки подтверждения; по умолчанию «Удалить» */
  confirmLabel?: string
  /** Опасное действие: кнопка подтверждения красная; по умолчанию true */
  danger?: boolean
}
