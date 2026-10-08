/**
 * Node-side matrix tests for the planner calendar math
 * (src/components/planner/calendar.ts) — a pure-logic supplement to the
 * existing TimelineMathDemo story.
 *
 * Covered:
 *  - day units: cell index = day difference from the anchor (incl. negatives);
 *  - decade units: cells aligned to calendar months (1–10 / 11–20 / 21–end);
 *  - the partial anchor decade (commit 9565d06): an anchor mid-month splits its
 *    calendar decade — cell 0 starts at the anchor day, a before-anchor cell
 *    covers [decade start … anchor-1], all other cells stay calendar-aligned;
 *  - anchors exactly on a decade start / on the month's first day (no split);
 *  - month ends and leap Feb 29 (a partial last decade ends at month end);
 *  - tiling & monotonicity: consecutive cells are contiguous (end + 1 day ===
 *    next start), indices strictly follow the calendar order, negative
 *    indices work both for day and decade units;
 *  - spanToDates / cellRangeForSpan round-trips on the split-anchor layout;
 *  - dateAtCellCoord: the date under a fractional cell coordinate (the pointer
 *    conversion feeding the context menu and the bar drag).
 */
import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  cellEndDate,
  cellIndexForDate,
  cellRangeForSpan,
  cellStartDate,
  dateAtCellCoord,
  spanToDates,
  windowCells,
  type PlanningUnit,
} from './calendar'
import { DAY_MS } from '@/utils'

/** Every consecutive pair of cells is contiguous and each cell is non-degenerate. */
function expectContiguous(origin: string, unit: PlanningUnit, from: number, count: number): void {
  const cells = windowCells(origin, unit, from, count)
  expect(cells).toHaveLength(count)
  for (const c of cells) {
    expect(c.index).toBeGreaterThanOrEqual(from)
    expect(c.start.getTime()).toBeLessThanOrEqual(c.end.getTime())
  }
  for (let k = 1; k < cells.length; k++) {
    const prev = cells[k - 1]!
    const cur = cells[k]!
    expect(cur.index).toBe(prev.index + 1)
    // end is inclusive — the next cell starts the day after.
    expect(cur.start.getTime() - prev.end.getTime()).toBe(DAY_MS)
  }
}

describe('day unit', () => {
  it('cell index is the day difference from the anchor (positive and negative)', () => {
    expect(cellIndexForDate('2025-02-28', 'day', '2025-02-28')).toBe(0)
    expect(cellIndexForDate('2025-02-28', 'day', '2025-03-01')).toBe(1)
    expect(cellIndexForDate('2025-02-28', 'day', '2025-02-27')).toBe(-1)
    expect(cellIndexForDate('2025-01-10', 'day', '2025-01-01')).toBe(-9)
    expect(cellIndexForDate('2025-01-10', 'day', '2025-01-19')).toBe(9)
  })

  it('start of cell i is anchor + i days; end equals its own start', () => {
    expect(fmt(cellStartDate('2025-01-10', 'day', -9))).toBe('2025-01-01')
    expect(fmt(cellStartDate('2025-01-10', 'day', 0))).toBe('2025-01-10')
    expect(fmt(cellStartDate('2025-01-10', 'day', 9))).toBe('2025-01-19')
    expect(cellEndDate('2025-01-10', 'day', 3).getTime()).toBe(cellStartDate('2025-01-10', 'day', 3).getTime())
  })

  it('tiles contiguously across a month boundary with negative indices', () => {
    expectContiguous('2025-02-28', 'day', -10, 20)
  })
})

describe('decade unit — anchor on the 1st of the month (no split)', () => {
  const origin = '2025-05-01'

  it('anchor month is covered by three calendar decades 1–10 / 11–20 / 21–end', () => {
    expect(fmt(cellStartDate(origin, 'decade', 0))).toBe('2025-05-01')
    expect(fmt(cellEndDate(origin, 'decade', 0))).toBe('2025-05-10')
    expect(fmt(cellStartDate(origin, 'decade', 1))).toBe('2025-05-11')
    expect(fmt(cellEndDate(origin, 'decade', 1))).toBe('2025-05-20')
    expect(fmt(cellStartDate(origin, 'decade', 2))).toBe('2025-05-21')
    expect(fmt(cellEndDate(origin, 'decade', 2))).toBe('2025-05-31')
  })

  it('cells continue into the next month and before the anchor month', () => {
    expect(fmt(cellStartDate(origin, 'decade', 3))).toBe('2025-06-01')
    expect(fmt(cellEndDate(origin, 'decade', 3))).toBe('2025-06-10')
    expect(fmt(cellStartDate(origin, 'decade', 4))).toBe('2025-06-11')
    expect(fmt(cellStartDate(origin, 'decade', -1))).toBe('2025-04-21')
    expect(fmt(cellEndDate(origin, 'decade', -1))).toBe('2025-04-30')
    expect(fmt(cellStartDate(origin, 'decade', -2))).toBe('2025-04-11')
  })

  it('maps dates to cells across month boundaries', () => {
    expect(cellIndexForDate(origin, 'decade', '2025-05-01')).toBe(0)
    expect(cellIndexForDate(origin, 'decade', '2025-05-10')).toBe(0)
    expect(cellIndexForDate(origin, 'decade', '2025-05-15')).toBe(1)
    expect(cellIndexForDate(origin, 'decade', '2025-05-31')).toBe(2)
    expect(cellIndexForDate(origin, 'decade', '2025-06-05')).toBe(3)
    expect(cellIndexForDate(origin, 'decade', '2025-06-25')).toBe(5)
    expect(cellIndexForDate(origin, 'decade', '2025-04-25')).toBe(-1)
    expect(cellIndexForDate(origin, 'decade', '2025-04-15')).toBe(-2)
    expect(cellIndexForDate(origin, 'decade', '2025-03-31')).toBe(-4)
  })

  it('tiles contiguously across month/year boundaries', () => {
    expectContiguous(origin, 'decade', -5, 12)
  })
})

describe('decade unit — partial anchor decade (9565d06 fix)', () => {
  const origin = '2025-05-15'

  it('cell 0 starts at the anchor day (partial first decade)', () => {
    expect(fmt(cellStartDate(origin, 'decade', 0))).toBe('2025-05-15')
    expect(fmt(cellEndDate(origin, 'decade', 0))).toBe('2025-05-20')
  })

  it('the anchor decade is split: a before-anchor cell covers decade start … anchor-1', () => {
    expect(fmt(cellStartDate(origin, 'decade', -1))).toBe('2025-05-11')
    expect(fmt(cellEndDate(origin, 'decade', -1))).toBe('2025-05-14')
    // The full decade cell before the anchor month stays calendar-aligned.
    expect(fmt(cellStartDate(origin, 'decade', -2))).toBe('2025-05-01')
    expect(fmt(cellEndDate(origin, 'decade', -2))).toBe('2025-05-10')
  })

  it('the rest of the anchor month and the following month stay aligned', () => {
    expect(fmt(cellStartDate(origin, 'decade', 1))).toBe('2025-05-21')
    expect(fmt(cellEndDate(origin, 'decade', 1))).toBe('2025-05-31')
    expect(fmt(cellStartDate(origin, 'decade', 2))).toBe('2025-06-01')
    expect(fmt(cellEndDate(origin, 'decade', 2))).toBe('2025-06-10')
  })

  it('maps dates to the split cells', () => {
    expect(cellIndexForDate(origin, 'decade', '2025-05-10')).toBe(-2)
    expect(cellIndexForDate(origin, 'decade', '2025-05-11')).toBe(-1)
    expect(cellIndexForDate(origin, 'decade', '2025-05-14')).toBe(-1)
    expect(cellIndexForDate(origin, 'decade', '2025-05-15')).toBe(0)
    expect(cellIndexForDate(origin, 'decade', '2025-05-20')).toBe(0)
    expect(cellIndexForDate(origin, 'decade', '2025-05-21')).toBe(1)
    expect(cellIndexForDate(origin, 'decade', '2025-05-31')).toBe(1)
    expect(cellIndexForDate(origin, 'decade', '2025-06-05')).toBe(2)
    expect(cellIndexForDate(origin, 'decade', '2025-04-25')).toBe(-3)
  })

  it('tiles contiguously across the split', () => {
    expectContiguous(origin, 'decade', -3, 8)
  })
})

describe('decade unit — anchor exactly on a decade start (no split)', () => {
  const origin = '2025-05-11'

  it('cell 0 is the full calendar decade 11–20, no before-anchor cell exists', () => {
    expect(fmt(cellStartDate(origin, 'decade', 0))).toBe('2025-05-11')
    expect(fmt(cellEndDate(origin, 'decade', 0))).toBe('2025-05-20')
    expect(fmt(cellStartDate(origin, 'decade', -1))).toBe('2025-05-01')
    expect(fmt(cellEndDate(origin, 'decade', -1))).toBe('2025-05-10')
    expect(cellIndexForDate(origin, 'decade', '2025-05-10')).toBe(-1)
    expect(cellIndexForDate(origin, 'decade', '2025-05-11')).toBe(0)
  })
})

describe('decade unit — leap-month end anchor (Feb 29, split at month end)', () => {
  const origin = '2024-02-29'

  it('the partial anchor decade ends at the month end (Feb 29)', () => {
    expect(fmt(cellStartDate(origin, 'decade', 0))).toBe('2024-02-29')
    expect(fmt(cellEndDate(origin, 'decade', 0))).toBe('2024-02-29')
  })

  it('the split before-anchor cell covers 21–28, the next month starts at 1', () => {
    expect(fmt(cellStartDate(origin, 'decade', -1))).toBe('2024-02-21')
    expect(fmt(cellEndDate(origin, 'decade', -1))).toBe('2024-02-28')
    expect(fmt(cellStartDate(origin, 'decade', 1))).toBe('2024-03-01')
    expect(cellIndexForDate(origin, 'decade', '2024-02-20')).toBe(-2)
    expect(cellIndexForDate(origin, 'decade', '2024-02-21')).toBe(-1)
    expect(cellIndexForDate(origin, 'decade', '2024-02-29')).toBe(0)
  })
})

describe('index monotonicity across mixed spans and units', () => {
  it('day indexes are non-decreasing along the calendar', () => {
    const dates = ['2024-12-20', '2025-01-01', '2025-02-28', '2025-03-01', '2025-03-10', '2025-06-15']
    let prev = -Infinity
    for (const d of dates) {
      const i = cellIndexForDate('2025-01-10', 'day', d)
      expect(i).toBeGreaterThanOrEqual(prev)
      prev = i
    }
  })

  it('decade indexes are non-decreasing along the calendar', () => {
    const dates = ['2025-03-31', '2025-04-01', '2025-04-15', '2025-05-10', '2025-05-16', '2025-06-30']
    let prev = -Infinity
    for (const d of dates) {
      const i = cellIndexForDate('2025-05-15', 'decade', d)
      expect(i).toBeGreaterThanOrEqual(prev)
      prev = i
    }
  })
})

describe('spanToDates / cellRangeForSpan round-trips', () => {
  it('day spans round-trip a single day', () => {
    const span = spanToDates('2025-01-10', 'day', 2, 3)
    expect(span).toEqual({ start_date: '2025-01-12', end_date: '2025-01-12' })
    expect(cellRangeForSpan('2025-01-10', 'day', '2025-01-12', '2025-01-12')).toEqual({ startCell: 2, endCell: 3 })
  })

  it('decade spans on a split anchor map back to the anchor-month cells', () => {
    // Cells 0..1 = [anchor … end of its calendar decade].
    const span = spanToDates('2025-05-15', 'decade', 0, 2)
    expect(span).toEqual({ start_date: '2025-05-15', end_date: '2025-05-31' })
    expect(cellRangeForSpan('2025-05-15', 'decade', '2025-05-15', '2025-05-31')).toEqual({ startCell: 0, endCell: 2 })
  })

  it('round-trips a decade built by windowCells', () => {
    const origin = '2025-05-15'
    const cells = windowCells(origin, 'decade', -2, 4)
    for (const c of cells) {
      const back = spanToDates(origin, 'decade', c.index, c.index + 1)
      expect(back.start_date).toBe(fmt(c.start))
      expect(back.end_date).toBe(fmt(c.end))
    }
  })
})

/** YYYY-MM-DD of a local date (mirrors calendar.fmtDate). */
function fmt(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Keeps the imported addDaysISO referenced in matrix sanity checks (a DST-safe
// day-step companion of the cell math).
describe('day-step sanity', () => {
  it('steps by calendar days, never by 23/25 h', () => {
    expect(addDaysISO('2025-03-08', 4)).toBe('2025-03-12')
    expect(addDaysISO('2025-03-08', 1)).toBe('2025-03-09')
  })
})
/**
 * dateAtCellCoord turns the fractional cell coordinate produced by
 * cellCoordAtViewportX (composables/timelineHelpers) into a date. For a day cell
 * the result must be that cell's own day for EVERY position inside it — the
 * coordinate already carries the scroll phase, so the date may not shift by a day
 * when the click lands near the cell's left edge.
 */
describe('dateAtCellCoord', () => {
  const origin = '2026-07-01'

  it('day unit: the whole cell maps to its own day, fractions included', () => {
    expect(fmt(dateAtCellCoord(origin, 'day', 0))).toBe('2026-07-01')
    expect(fmt(dateAtCellCoord(origin, 'day', 0.001))).toBe('2026-07-01')
    expect(fmt(dateAtCellCoord(origin, 'day', 0.999))).toBe('2026-07-01')
    expect(fmt(dateAtCellCoord(origin, 'day', 1))).toBe('2026-07-02')
    expect(fmt(dateAtCellCoord(origin, 'day', 15.4))).toBe('2026-07-16')
  })

  it('day unit: negative coordinates (cells before the origin) floor towards -infinity', () => {
    // Cell -1 spans coordinates [-1, 0), cell -2 spans [-2, -1): a coordinate of
    // -1.5 lies inside cell -2, exactly as the positive side behaves.
    expect(fmt(dateAtCellCoord(origin, 'day', -1))).toBe('2026-06-30')
    expect(fmt(dateAtCellCoord(origin, 'day', -0.001))).toBe('2026-06-30')
    expect(fmt(dateAtCellCoord(origin, 'day', -1.5))).toBe('2026-06-29')
    expect(fmt(dateAtCellCoord(origin, 'day', -1.999))).toBe('2026-06-29')
  })

  it('decade unit: the fraction marks a day inside the decade, never the neighbour', () => {
    const cellStart = cellStartDate(origin, 'decade', 1)
    const cellEnd = cellEndDate(origin, 'decade', 1)
    for (const frac of [0, 0.25, 0.5, 0.99]) {
      const d = dateAtCellCoord('2026-07-01', 'decade', 1 + frac)
      const cell = cellIndexForDate('2026-07-01', 'decade', d)
      expect(cell, `coord ${1 + frac} landed in cell ${cell}`).toBe(1)
      expect(d.getTime()).toBeGreaterThanOrEqual(cellStart.getTime())
      expect(d.getTime()).toBeLessThanOrEqual(cellEnd.getTime())
    }
  })

  it('decade unit: the very start of a cell is its first day', () => {
    for (const i of [-2, 0, 1, 4]) {
      expect(dateAtCellCoord('2026-07-01', 'decade', i).getTime())
        .toBe(cellStartDate('2026-07-01', 'decade', i).getTime())
    }
  })
})
