export interface TooltipCellProps {
  /** Текст тултипа; можно не указывать, если контент передан слотом #popup */
  text?: string
  /** Многострочный режим: текст переносится по строкам (white-space: normal, max-width) */
  multiline?: boolean
}
