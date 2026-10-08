import { describe, expect, it } from 'vitest'
import { cellCoordAtViewportX, growStep, windowStartFor } from './timelineHelpers'
import { LABEL_WIDTH, CELL_WIDTH } from '../components/planner/layout'

/**
 * The pointer → cell conversion is the single source of truth for "which cell did
 * the user click": the context menu that creates a project/process/task and the
 * bar drag both read it. The visible window is scrolled by an arbitrary fraction
 * of a cell, so the conversion has to go through the content coordinate; a formula
 * built on `windowStart + floor((x - LABEL_WIDTH) / cellPx)` resolves a click near
 * the left edge of a cell to the previous one (the reported bug: a new bar started
 * one column earlier than the clicked one).
 */
describe('cellCoordAtViewportX', () => {
  const CELL = 32

  it('is 0 at the timeline origin and counts cells to the right', () => {
    expect(cellCoordAtViewportX(LABEL_WIDTH, 0, 1, CELL, 0)).toBeCloseTo(0, 5)
    expect(cellCoordAtViewportX(LABEL_WIDTH + CELL, 0, 1, CELL, 0)).toBeCloseTo(1, 5)
    expect(cellCoordAtViewportX(LABEL_WIDTH + 2.5 * CELL, 0, 1, CELL, 0)).toBeCloseTo(2.5, 5)
  })

  it('nulls out left of the label column', () => {
    expect(cellCoordAtViewportX(LABEL_WIDTH - 1, 0, 1, CELL, 0)).toBeNull()
    // the scrolled window can push the origin's cells under the column as well
    expect(cellCoordAtViewportX(179, 0, 1, CELL, 0)).toBeNull()
    expect(cellCoordAtViewportX(1, 0, 1, 0, 0)).toBeNull()
  })

  it('keeps the cell a click belongs to, whatever the scroll phase is', () => {
    // The regression: with a 20px phase the first rendered cell's left edge sits at
    // x=160, and its own left 20px band used to resolve to the previous cell.
    const scrollLeft = 16 * CELL + 20
    const firstRenderedCellLeft = 160
    const coord = cellCoordAtViewportX(firstRenderedCellLeft + 2, scrollLeft, 1, CELL, 0)
    expect(Math.floor(coord!)).toBe(16)
    // the naive "windowStart + floor((x - LABEL_WIDTH) / cellPx)" formula gives 15 here
    const naive = windowStartFor(scrollLeft, CELL, 0) + Math.floor((firstRenderedCellLeft + 2 - LABEL_WIDTH) / CELL)
    expect(naive).toBe(15)
  })

  it('is invariant when the point and the scroll move together by the same delta', () => {
    // The property the bug violated: the same visual point inside a cell must map to
    // that cell no matter how the window happens to be scrolled.
    for (const delta of [0, 1, 7.3, CELL - 0.5, CELL, 3 * CELL + 11]) {
      const x = LABEL_WIDTH + 2 * CELL + 4
      const base = cellCoordAtViewportX(x, 0, 1, CELL, 0)
      const shifted = cellCoordAtViewportX(x - delta, delta, 1, CELL, 0)
      expect(shifted).toBeCloseTo(base!, 5)
    }
  })

  it('applies the zoom once, to the scroll offset and the pointer together', () => {
    // scale 0.5: a 32px cell renders 16px wide; the third cell starts at 90 + 48 = 138
    const scale = 0.5
    expect(cellCoordAtViewportX(LABEL_WIDTH * scale + 3 * CELL * scale + 2, 0, scale, CELL, 0))
      .toBeCloseTo(3.125, 5)
    // scrolling by exactly one rendered cell shifts the coordinate by exactly one
    const x = LABEL_WIDTH * scale + 2 * CELL * scale + 5
    expect(cellCoordAtViewportX(x, CELL * scale, scale, CELL, 0))
      .toBeCloseTo(cellCoordAtViewportX(x, 0, scale, CELL, 0)! + 1, 5)
  })

  it('counts cells materialized before the origin through leftPad', () => {
    // One rendered cell right of the column is 5 cells left of the origin
    expect(cellCoordAtViewportX(LABEL_WIDTH + CELL, 0, 1, CELL, 5)).toBeCloseTo(-4, 5)
  })

  it('does not fall one cell short on a boundary that floats land just below', () => {
    // (3 + 99) / 0.3 is 339.99999999999994 in binary floating point, while the
    // boundary itself is at 340 — the boundary guard keeps the cell at 5
    const coord = cellCoordAtViewportX(99, 3, 0.3, CELL, 0)
    expect(Math.floor(coord!)).toBe(5)
  })

  it('falls back to sane defaults for a degenerate scale or cell width', () => {
    expect(cellCoordAtViewportX(LABEL_WIDTH + CELL_WIDTH, 0, 0, CELL_WIDTH, 0)).toBeCloseTo(1, 5)
    expect(cellCoordAtViewportX(LABEL_WIDTH, 0, 1, 0, 0)).toBeNull()
  })
})

describe('growStep / windowStartFor', () => {
  it('scales the growth step with the visible width', () => {
    expect(growStep(10)).toBe(12)
    expect(growStep(40)).toBe(20)
  })

  it('floors the window start and accounts for leftPad', () => {
    expect(windowStartFor(0, 32, 0)).toBe(0)
    expect(windowStartFor(32 * 7 + 5, 32, 0)).toBe(7)
    expect(windowStartFor(32 * 7 + 5, 32, 3)).toBe(4)
  })
})
