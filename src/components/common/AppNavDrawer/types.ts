import type { NavCategory } from '../../../composables/useNavigation'

/** Sync status block shown in the drawer footer (desktop only) */
export interface DrawerSyncStats {
  /** Whether sync UI is available (Electron build) */
  enabled: boolean
  /** Offline: changes queue up, data comes from cache */
  offline: boolean
  /** Number of changes awaiting sync (badge on "Синхронизация") */
  pending: number
  /** Human-readable "how long ago data was last pulled" label, or null */
  lastPullLabel: string | null
}

export interface AppNavDrawerProps {
  /** Drawer visibility */
  open: boolean
  /** Permission-filtered nav categories (already RBAC-filtered) */
  categories: NavCategory[]
  /** Currently active route name (for highlighting) */
  activeName?: string
  /** Brand shown in the drawer header; this is the only place the brand lives */
  brand?: string
  /** Desktop sync status; undefined hides the "Система" section (web) */
  sync?: DrawerSyncStats
}

export interface AppNavDrawerEmits {
  /** Request to close the drawer (overlay, ×, Esc, item click) */
  close: []
}