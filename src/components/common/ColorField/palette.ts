/**
 * Fixed quick-pick palette for ColorField: 8 hue families × 5 saturation/lightness
 * steps. Columns are hue families, rows go from lightest (top) to deepest (bottom).
 * These are user-facing choice data (stored as #RRGGBB), not theme tokens, so they
 * are intentionally hardcoded here.
 */
export const COLOR_PALETTE: readonly (readonly string[])[] = [
  // red
  ['#FCA5A5', '#F87171', '#EF4444', '#DC2626', '#B91C1C'],
  // orange
  ['#FDBA74', '#FB923C', '#F97316', '#EA580C', '#C2410C'],
  // amber
  ['#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B', '#D97706'],
  // green
  ['#86EFAC', '#4ADE80', '#22C55E', '#16A34A', '#15803D'],
  // teal
  ['#5EEAD4', '#2DD4BF', '#14B8A6', '#0D9488', '#0F766E'],
  // blue
  ['#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8'],
  // violet
  ['#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9'],
  // slate
  ['#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#334155'],
]

export const PALETTE_HUES = COLOR_PALETTE.length
export const PALETTE_SHADES = COLOR_PALETTE[0]?.length ?? 0