/** Тип периода отображения календаря — количество календарных месяцев от месяца anchor */
export type PlanningMode = 'quarter' | 'half' | 'year'

/** Единица ячейки шкалы: день или декада (10 дней) */
export type PlanningUnit = 'day' | 'decade'

/** Длина периода в календарных месяцах (от месяца anchor включительно) */
export const MODE_MONTHS: Record<PlanningMode, number> = {
  quarter: 3,
  half: 6,
  year: 12,
}

const DAY_MS = 1000 * 60 * 60 * 24

/** Дата в локальной временной зоне. Строки «YYYY-MM-DD» парсятся как локальная полночь,
 * а не UTC (иначе getTime() не совпадёт с локальной полночью ячеек). */
export function toDate(v: Date | string | number): Date {
  if (v instanceof Date) return v
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(v)
}

/** Дата, приведённая к началу суток в локальной зоне */
function toDayStart(v: Date | string | number): Date {
  const d = toDate(v)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Время начала суток, предшествующих дате v (для эксклюзивной границы end) */
function dayBefore(v: Date | string | number): number {
  const d = toDayStart(v)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime()
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/** Последний день месяца даты d (новый Date, чтобы не мутировать исходный) */
function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

/** Граница декады (последний день) для даты внутри месяца: 10, 20 или конец месяца */
function decadeEnd(d: Date): Date {
  if (d.getDate() <= 10) return new Date(d.getFullYear(), d.getMonth(), 10)
  if (d.getDate() <= 20) return new Date(d.getFullYear(), d.getMonth(), 20)
  return lastDayOfMonth(d)
}

/** Количество декад, оставшихся в месяце от дня anchor до конца месяца (1-3) */
function decadesInAnchorMonth(a: Date): number {
  return a.getDate() <= 10 ? 3 : a.getDate() <= 20 ? 2 : 1
}

/** Количество ячеек на шкале для пары mode/unit.
 * Для декад — все оставшиеся декады месяца anchor (1-3) + по 3 декады в каждом следующем месяце.
 * Для дней — каждый день от anchor до конца последнего месяца периода. */
export function cellCount(anchor: Date | string | number, mode: PlanningMode, unit: PlanningUnit): number {
  const a = toDayStart(anchor)
  const months = MODE_MONTHS[mode]
  if (unit === 'decade') return decadesInAnchorMonth(a) + 3 * (months - 1)
  const end = new Date(a.getFullYear(), a.getMonth() + months, 0)
  return Math.round((end.getTime() - a.getTime()) / DAY_MS) + 1
}

export interface CellSpan {
  startCell: number
  endCell: number
}

export interface CalendarCell {
  index: number
  start: Date
  end: Date
}

/** Ячейки календаря от anchor на период mode с единицей unit.
 * Декады выровнены по месяцам: 1-10, 11-20, 21-конец; первая декада месяца anchor частичная (от anchor). */
export function buildCells(anchor: Date | string | number, mode: PlanningMode, unit: PlanningUnit): CalendarCell[] {
  const a = toDayStart(anchor)
  const cells: CalendarCell[] = []
  if (unit === 'decade') {
    const months = MODE_MONTHS[mode]
    // Месяц anchor: все оставшиеся декады от дня anchor до конца месяца
    const monthEnd = lastDayOfMonth(a)
    let cur = a
    while (cur <= monthEnd) {
      const end = decadeEnd(cur)
      cells.push({ index: cells.length, start: cur, end })
      cur = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
    }
    // Последующие месяцы: по 3 полные декады (cur уже — первое число следующего месяца)
    for (let m = 1; m < months; m++) {
      const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1)
      for (let dec = 0; dec < 3; dec++) {
        const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 + dec * 10)
        const end = dec < 2 ? new Date(start.getFullYear(), start.getMonth(), 10 + dec * 10) : lastDayOfMonth(monthStart)
        cells.push({ index: cells.length, start, end })
      }
      cur = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    }
    return cells
  }
  const end = new Date(a.getFullYear(), a.getMonth() + MODE_MONTHS[mode], 0)
  let cur = a
  while (cur <= end) {
    cells.push({ index: cells.length, start: cur, end: cur })
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }
  return cells
}

/** Индекс ячейки, содержащей дату date (зажат в [0, len-1]) */
function cellIndexOf(cells: CalendarCell[], t: number): number {
  const len = cells.length
  if (len === 0) return 0
  if (t < cells[0].start.getTime()) return 0
  const last = cells[len - 1].end.getTime()
  if (t > last) return len - 1
  const idx = cells.findIndex((c) => c.start.getTime() <= t && t <= c.end.getTime())
  return idx >= 0 ? idx : 0
}

/**
 * Ячейки интервала [start, end) на шкале: end не включается (эксклюзивная граница).
 * endCell — эксклюзивная граница. Результат зажат в [0, cellCount].
 * Возвращает null, если интервал некорректен (end <= start) или не пересекает
 * диаграмму целиком (все дни левее или правее календаря) — бар скрывается.
 */
export function barCells(
  anchor: Date | string | number,
  mode: PlanningMode,
  unit: PlanningUnit,
  start: Date | string | number,
  end: Date | string | number,
): CellSpan | null {
  const cells = buildCells(anchor, mode, unit)
  const len = cells.length
  if (!len) return null
  const s = toDayStart(start)
  const e = toDayStart(end)
  if (e.getTime() <= s.getTime()) return null
  const sT = s.getTime()
  const eT = dayBefore(end)
  const first = cells[0].start.getTime()
  const last = cells[len - 1].end.getTime()
  if (eT < first) return null
  if (sT > last) return null
  const startCell = cellIndexOf(cells, sT)
  const endCell = clamp(cellIndexOf(cells, eT) + 1, startCell + 1, len)
  return { startCell, endCell }
}

/** Индекс ячейки, содержащей одиночную дату date (точка на шкале), или null, если дата вне диаграммы. */
export function dateCellIndex(
  anchor: Date | string | number,
  mode: PlanningMode,
  unit: PlanningUnit,
  date: Date | string | number,
): number | null {
  const cells = buildCells(anchor, mode, unit)
  if (!cells.length) return null
  const t = toDayStart(date).getTime()
  const first = cells[0].start.getTime()
  const last = cells[cells.length - 1].end.getTime()
  if (t < first || t > last) return null
  return cellIndexOf(cells, t)
}
