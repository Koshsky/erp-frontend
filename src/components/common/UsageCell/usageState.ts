export type UsageState = 'normal' | 'warn' | 'critical' | 'unknown' | 'weekend'

export interface UsageStateInput {
  used: number
  available: number | null
  isWeekend?: boolean
}

/**
 * Cell load state by used/available percentage (shared by UsageCell and
 * UsageTooltip): ≤100% normal, up to 160% overload, >160% critical. available === 0
 * with usage — critical; without a period/availability — unknown; a day off — weekend.
 */
export function usageState({ used, available, isWeekend }: UsageStateInput): UsageState {
  if (isWeekend) return 'weekend'
  if (available == null) return 'unknown'
  if (available === 0) return used > 0 ? 'critical' : 'normal'
  const pct = (used / available) * 100
  if (pct <= 100) return 'normal'
  if (pct <= 160) return 'warn'
  return 'critical'
}

/** Load percentage (null if there is nothing to compute from: no data or zero availability) */
export function usagePercent(used: number, available: number | null): number | null {
  if (available == null || available === 0) return null
  return (used / available) * 100
}

/** State color (cell background) and label — for the usage tooltip */
export const USAGE_STATE_META: Record<UsageState, { label: string; color: string }> = {
  normal: { label: 'Норма', color: 'var(--ui-usage-ok)' },
  warn: { label: 'Перегруз', color: 'var(--ui-usage-warn)' },
  critical: { label: 'Критично', color: 'var(--ui-usage-crit)' },
  unknown: { label: 'Нет данных', color: 'var(--ui-usage-unknown)' },
  weekend: { label: 'Выходной', color: 'var(--ui-usage-weekend)' },
}
