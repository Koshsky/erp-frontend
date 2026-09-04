/** Scale/scroll state of a single table (kept across unmounts) */
export interface TableScaleState {
  /** Cell width in px (--cell-width) */
  cellPx: number
  /** Table scale (zoom on .tg-content) */
  scale: number
  /** Horizontal scroll (in scaled px) */
  scrollLeft: number
  /** Vertical scroll */
  scrollTop: number
}

/**
 * In-memory per-id table state storage: survives unmounting
 * (tab switches), but is reset by a page reload.
 */
const tableStates = new Map<string, TableScaleState>()

/** Persist table scale/scroll between mounts (keyed by a stable id) */
export function useTableState() {
  function get(id: string | undefined): TableScaleState | undefined {
    return id ? tableStates.get(id) : undefined
  }

  function save(id: string | undefined, state: TableScaleState): void {
    if (id) tableStates.set(id, state)
  }

  return { get, save }
}
