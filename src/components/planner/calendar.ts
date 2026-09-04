/** Timeline cell unit: day or decade (10 days) */
export type PlanningUnit = 'day' | 'decade'

import { LABEL_WIDTH } from './layout'
import { DAY_MS, clamp } from '../../utils'

/** Date in the local timezone. "YYYY-MM-DD" strings are parsed as local midnight,
 * not UTC (otherwise getTime() would not match the cells' local midnight). */
export function toDate(v: Date | string | number): Date {
  if (v instanceof Date) return v
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(v)
}

/** Date normalized to the start of the day in the local timezone */
function toDayStart(v: Date | string | number): Date {
  const d = toDate(v)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Date in YYYY-MM-DD format (local timezone) */
export function fmtDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Date n days later (YYYY-MM-DD, local timezone) */
export function addDaysISO(date: Date | string | number, days: number): string {
  const d = toDayStart(date)
  return fmtDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))
}

/** Date n calendar months later (YYYY-MM-DD, local timezone) */
export function addMonthsISO(date: Date | string | number, months: number): string {
  const d = toDayStart(date)
  return fmtDate(new Date(d.getFullYear(), d.getMonth() + months, d.getDate()))
}

/** Date range "dd.mm.yyyy — dd.mm.yyyy" (local timezone) for bar tooltips */
export function formatDateRange(start: Date | string | number, end: Date | string | number): string {
  return `${toDate(start).toLocaleDateString('ru')} — ${toDate(end).toLocaleDateString('ru')}`
}

/** Last day of the month of date d (a new Date, so the original is not mutated) */
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
// Infinite timeline in absolute cell indices.
// origin — the anchor date; cell i — the absolute index (may be negative).
// Day:   i  = origin + i days.  Decade: strictly by the calendar (1-10/11-20/21-end),
// cell 0 — the decade containing origin; month = month(origin) + floor(i/3).
// ============================================================================

/** Month in absolute count: year*12 + month (for month differences). */
function monthNumber(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth()
}

/** Decade number within the month by date: 0 ([1..10]), 1 ([11..20]), 2 ([21..end]). */
function decadeIndexOfDay(d: Date): number {
  if (d.getDate() <= 10) return 0
  if (d.getDate() <= 20) return 1
  return 2
}

/** First day of the month and decade number for cell i (correct for negative i). */
function cellMonthDec(origin: Date, i: number): { first: Date; dec: number } {
  const first = new Date(origin.getFullYear(), origin.getMonth() + Math.floor(i / 3), 1)
  const dec = ((i % 3) + 3) % 3
  return { first, dec }
}

/**
 * Absolute index of the cell containing the date. Always exists (may be
 * negative). For days — the day difference from origin; for decades — calendar anchoring.
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

/** Start date of cell i (local midnight). */
export function cellStartDate(origin: Date | string | number, unit: PlanningUnit, i: number): Date {
  const o = toDayStart(origin)
  if (unit === 'day') return new Date(o.getFullYear(), o.getMonth(), o.getDate() + i)
  const { first, dec } = cellMonthDec(o, i)
  return new Date(first.getFullYear(), first.getMonth(), 1 + dec * 10)
}

/** End date of cell i (inclusive, local midnight). */
export function cellEndDate(origin: Date | string | number, unit: PlanningUnit, i: number): Date {
  if (unit === 'day') return cellStartDate(origin, unit, i)
  const { first, dec } = cellMonthDec(toDayStart(origin), i)
  if (dec < 2) return new Date(first.getFullYear(), first.getMonth(), 10 + dec * 10)
  return lastDayOfMonth(first)
}

/** count consecutive cells starting from fromCell (absolute indices). */
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
 * Span of the interval [start, end] (both bounds inclusive) in absolute cells.
 * endCell — the exclusive bound (index of the cell after the last occupied one).
 * Returns null if the interval is invalid (end < start).
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

/** Converts a cell span [startCell, endCell) to dates [start, end] (both inclusive). */
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

/** Parent bounds in absolute cells (for drag clamping). null if not set/invalid. */
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
 * Clamps the date interval [start, end] (both bounds inclusive) into the actual
 * parent bounds [bStart, bEnd]. Result always has end >= start (minimum 1 day).
 * If the bounds are not set — the interval is unchanged.
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
 * Clamps a single date into the actual parent bounds [bStart, bEnd]
 * (both bounds inclusive). If the bounds are not set — the date is unchanged.
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
 * Fits the interval [start, end] into the parent bounds [bStart, bEnd], preserving
 * duration (unlike clampSpanDates, which truncates): if the interval lies entirely
 * (or sticks out) left of the parent start — it is pushed to the start and grows
 * right by its own length; right of the end — pushed to the end and grows left;
 * if the duration exceeds the parent — it occupies the parent entirely.
 * If the bounds are not set — the interval is unchanged.
 */
export function shiftSpanDates(
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
  const bs = toDayStart(bStart).getTime()
  const be = toDayStart(bEnd).getTime()
  const len = e.getTime() - s.getTime()
  let ns = s.getTime()
  let ne = ns + len
  if (len >= be - bs) {
    ns = bs
    ne = be
  } else {
    if (ns < bs) {
      ns = bs
      ne = ns + len
    }
    if (ne > be) {
      ne = be
      ns = ne - len
    }
  }
  return { start_date: fmtDate(new Date(ns)), end_date: fmtDate(new Date(ne)) }
}

/**
 * Date under the mouse pointer on the infinite timeline.
 * windowStartCell — absolute cell index at the left edge of the timeline (visible window),
 * cellPx — cell width in px, rect — the container (including the LABEL_WIDTH label column),
 * scale — CSS zoom of the container (viewport coordinates are divided by the scale).
 * Returns YYYY-MM-DD (local timezone) or null if the click is left of the timeline.
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
