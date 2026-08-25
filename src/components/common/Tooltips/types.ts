/** Одна запись лога комментариев в тултипе задачи */
export interface BarTooltipComment {
  /** Имя автора (резолвится на фронте из author_id) */
  author?: string
  /** Короткая дата-время */
  date?: string
  text: string
}

/** Общий тултип объекта диаграммы: заголовок + строки + ресурсы (задача/проект/процесс/веха) */
export interface BarTooltipProps {
  title: string
  /** Дополнительные строки (даты, владелец, приоритет, содержимое и т.п.) */
  rows?: string[]
  /** Список ресурсов с количеством — отдельным блоком с разделителем */
  resources?: { label: string; quantity?: number }[]
  /** Лог комментариев задачи (показывается до 4 записей + «…и ещё N») */
  comments?: BarTooltipComment[]
  /** Акцентный цвет заголовка (задача=зелёный, проект/процесс=синий, веха=янтарный) */
  accent?: string
}

/** Тултип загрузки ресурса: дробь, процент и состояние с цветом */
export interface UsageTooltipProps {
  used: number
  available: number | null
  /** Отсутствующие сотрудники ресурса (для секции «Отсутствуют:») */
  absentees?: { user_name?: string; state_name?: string; start_date?: string; end_date?: string }[]
}

/** Простая подсказка/состояние: заголовок + строки + опциональный цветной маркер */
export interface InfoTooltipProps {
  title?: string
  lines?: string[]
  /** Цветной маркер слева (например цвет состояния табеля); null/'' — без маркера */
  marker?: string | null
}
