export interface ScaleBadgeProps {
  /** Текущий масштаб таблицы (zoom на .tg-content, 0.5–2) */
  scale: number
  /** Счётчик изменений масштаба: каждый инкремент показывает бейдж на время */
  bump: number
}
