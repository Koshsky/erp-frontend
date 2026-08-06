/** Единица ячейки шкалы: день или декада (10 дней) */
export type PlanningUnit = 'day' | 'decade'

import { LABEL_WIDTH } from './layout'

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

/** Дата в формате YYYY-MM-DD (локальная зона) */
export function fmtDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Дата через n дней (YYYY-MM-DD, локальная зона) */
export function addDaysISO(date: Date | string | number, days: number): string {
  const d = toDayStart(date)
  return fmtDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))
}

/** Дата через n календарных месяцев (YYYY-MM-DD, локальная зона) */
export function addMonthsISO(date: Date | string | number, months: number): string {
  const d = toDayStart(date)
  return fmtDate(new Date(d.getFullYear(), d.getMonth() + months, d.getDate()))
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/** Последний день месяца даты d (новый Date, чтобы не мутировать исходный) */
function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
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

// ============================================================================
// Бесконечная шкала в абсолютных индексах ячеек.
// origin — дата-якорь; ячейка i — абсолютный индекс (может быть отрицательным).
// День:  i  = origin + i дней.  Декада: строго по календарю (1-10/11-20/21-конец),
// ячейка 0 — декада, содержащая origin; месяц = месяц(origin) + floor(i/3).
// ============================================================================

/** Месяц в абсолютном счёте: год*12 + месяц (для разницы месяцев). */
function monthNumber(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth()
}

/** Номер декады внутри месяца по дате: 0 ([1..10]), 1 ([11..20]), 2 ([21..конец]). */
function decadeIndexOfDay(d: Date): number {
  if (d.getDate() <= 10) return 0
  if (d.getDate() <= 20) return 1
  return 2
}

/** Первое число месяца и номер декады для ячейки i (корректно для отрицательных i). */
function cellMonthDec(origin: Date, i: number): { first: Date; dec: number } {
  const first = new Date(origin.getFullYear(), origin.getMonth() + Math.floor(i / 3), 1)
  const dec = ((i % 3) + 3) % 3
  return { first, dec }
}

/**
 * Абсолютный индекс ячейки, содержащей дату. Всегда существует (может быть
 * отрицательным). Для дней — разница дат от origin; для декад — календарная привязка.
 */
export function cellIndexForDate(
  origin: Date | string | number,
  unit: PlanningUnit,
  date: Date | string | number,
): number {
  const o = toDayStart(origin)
  const d = toDayStart(date)
  if (unit === 'day') return Math.round((d.getTime() - o.getTime()) / DAY_MS)
  return (monthNumber(d) - monthNumber(o)) * 3 + decadeIndexOfDay(d)
}

/** Дата начала ячейки i (локальная полночь). */
export function cellStartDate(origin: Date | string | number, unit: PlanningUnit, i: number): Date {
  const o = toDayStart(origin)
  if (unit === 'day') return new Date(o.getFullYear(), o.getMonth(), o.getDate() + i)
  const { first, dec } = cellMonthDec(o, i)
  return new Date(first.getFullYear(), first.getMonth(), 1 + dec * 10)
}

/** Дата конца ячейки i (включительно, локальная полночь). */
export function cellEndDate(origin: Date | string | number, unit: PlanningUnit, i: number): Date {
  if (unit === 'day') return cellStartDate(origin, unit, i)
  const { first, dec } = cellMonthDec(toDayStart(origin), i)
  if (dec < 2) return new Date(first.getFullYear(), first.getMonth(), 10 + dec * 10)
  return lastDayOfMonth(first)
}

/** count подряд идущих ячеек, начиная с fromCell (абсолютные индексы). */
export function windowCells(
  origin: Date | string | number,
  unit: PlanningUnit,
  fromCell: number,
  count: number,
): CalendarCell[] {
  const cells: CalendarCell[] = []
  for (let k = 0; k < count; k++) {
    const i = fromCell + k
    cells.push({ index: i, start: cellStartDate(origin, unit, i), end: cellEndDate(origin, unit, i) })
  }
  return cells
}

/**
 * Спан интервала [start, end] (обе границы включительно) в абсолютных ячейках.
 * endCell — эксклюзивная граница (индекс ячейки, следующей за последней занятой).
 * Возвращает null, если интервал некорректен (end < start).
 */
export function cellRangeForSpan(
  origin: Date | string | number,
  unit: PlanningUnit,
  start: Date | string | number,
  end: Date | string | number,
): CellSpan | null {
  const s = toDayStart(start)
  const e = toDayStart(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
  if (e.getTime() < s.getTime()) return null
  const startCell = cellIndexForDate(origin, unit, s)
  const endCell = Math.max(cellIndexForDate(origin, unit, e) + 1, startCell + 1)
  return { startCell, endCell }
}

/** Преобразование спана ячеек [startCell, endCell) в даты [start, end] (обе включительно). */
export function spanToDates(
  origin: Date | string | number,
  unit: PlanningUnit,
  startCell: number,
  endCell: number,
): { start_date: string; end_date: string } {
  const s = Math.min(startCell, endCell - 1)
  const e = Math.max(endCell, s + 1)
  const last = cellEndDate(origin, unit, e - 1)
  return { start_date: fmtDate(cellStartDate(origin, unit, s)), end_date: fmtDate(last) }
}

/** Границы родителя в абсолютных ячейках (для зажима драга). null, если не заданы/некорректны. */
export function boundsForSpan(
  origin: Date | string | number,
  unit: PlanningUnit,
  startDate?: Date | string | number | null,
  endDate?: Date | string | number | null,
): CellSpan | null {
  if (startDate == null || endDate == null) return null
  return cellRangeForSpan(origin, unit, startDate, endDate)
}

/**
 * Зажим интервала дат [start, end] (обе границы включительно) в фактические
 * границы родителя [bStart, bEnd]. Результат всегда с end >= start (минимум 1 день).
 * Если границы не заданы — интервал как есть.
 */
export function clampSpanDates(
  start: Date | string | number,
  end: Date | string | number,
  bStart?: Date | string | number | null,
  bEnd?: Date | string | number | null,
): { start_date: string; end_date: string } {
  const s = toDayStart(start)
  const e = toDayStart(end)
  if (bStart == null || bEnd == null) {
    return { start_date: fmtDate(s), end_date: fmtDate(e) }
  }
  const bs = toDayStart(bStart)
  const be = toDayStart(bEnd)
  const ns = clamp(s.getTime(), bs.getTime(), be.getTime())
  const ne = clamp(e.getTime(), ns, be.getTime())
  return { start_date: fmtDate(new Date(ns)), end_date: fmtDate(new Date(ne)) }
}

/**
 * Зажим одиночной даты в фактические границы родителя [bStart, bEnd]
 * (обе границы включительно). Если границы не заданы — дата как есть.
 */
export function clampDateToBounds(
  date: Date | string | number,
  bStart?: Date | string | number | null,
  bEnd?: Date | string | number | null,
): string {
  const t = toDayStart(date).getTime()
  if (bStart == null || bEnd == null) {
    return fmtDate(new Date(t))
  }
  const bs = toDayStart(bStart).getTime()
  const be = toDayStart(bEnd).getTime()
  return fmtDate(new Date(clamp(t, bs, be)))
}

/**
 * Дата под указателем мыши в бесконечной шкале.
 * windowStartCell — абсолютный индекс ячейки у левого края шкалы (видимое окно),
 * cellPx — ширина ячейки в px, rect — контейнер (включая колонку названий LABEL_WIDTH),
 * scale — CSS-зум контейнера (viewport-координаты делятся на масштаб).
 * Возвращает YYYY-MM-DD (локальная зона) либо null, если клик левее шкалы.
 */
export function dateForPointer(
  origin: Date | string | number,
  unit: PlanningUnit,
  windowStartCell: number,
  cellPx: number,
  rect: DOMRect | null,
  clientX: number,
  scale = 1,
): string | null {
  if (!rect || cellPx <= 0) return null
  const x = (clientX - rect.left) / scale
  if (x < LABEL_WIDTH) return null
  const raw = (x - LABEL_WIDTH) / cellPx
  const i = Math.floor(raw)
  const frac = raw - i
  const start = cellStartDate(origin, unit, windowStartCell + i).getTime()
  const end = cellEndDate(origin, unit, windowStartCell + i).getTime()
  return fmtDate(new Date(start + Math.round(frac * (end - start))))
}
