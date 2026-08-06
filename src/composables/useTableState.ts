/** Состояние масштаба/прокрутки одной таблицы (сохраняется при размонтировании) */
export interface TableScaleState {
  /** Ширина ячейки в px (--cell-width) */
  cellPx: number
  /** Масштаб таблицы (zoom на .tg-content) */
  scale: number
  /** Горизонтальная прокрутка (в масштабированных px) */
  scrollLeft: number
  /** Вертикальная прокрутка */
  scrollTop: number
}

/**
 * In-memory хранилище состояния таблиц по id: переживает размонтирование
 * (переключение вкладок), но сбрасывается перезагрузкой страницы.
 */
const tableStates = new Map<string, TableScaleState>()

/** Персист масштаба/прокрутки таблицы между монтированиями (по стабильному id) */
export function useTableState() {
  function get(id: string | undefined): TableScaleState | undefined {
    return id ? tableStates.get(id) : undefined
  }

  function save(id: string | undefined, state: TableScaleState): void {
    if (id) tableStates.set(id, state)
  }

  return { get, save }
}
