export interface PlannerStatesProps {
  /** Идёт загрузка данных */
  loading: boolean
  /** Текст ошибки (показывается баннером; при отсутствии данных — и по центру) */
  error: string | null
  /** Есть ли данные для отрисовки слота (грида) */
  hasData: boolean
  /** Текст пустого состояния; по умолчанию «Нет данных» */
  emptyText?: string
}
