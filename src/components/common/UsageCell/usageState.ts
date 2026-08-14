export type UsageState = 'normal' | 'warn' | 'critical' | 'unknown' | 'weekend'

export interface UsageStateInput {
  used: number
  available: number | null
  isWeekend?: boolean
}

/**
 * Состояние загрузки ячейки по проценту used/available (общий для UsageCell и
 * UsageTooltip): ≤100% норма, до 160% перегруз, >160% критично. available === 0
 * с занятостью — критично; без периода/доступности — unknown; выходной — weekend.
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

/** Процент загрузки (null, если считать не из чего: нет данных или доступность 0) */
export function usagePercent(used: number, available: number | null): number | null {
  if (available == null || available === 0) return null
  return (used / available) * 100
}

/** Цвет состояния (фон ячейки) и подпись — для тултипа загрузки */
export const USAGE_STATE_META: Record<UsageState, { label: string; color: string }> = {
  normal: { label: 'Норма', color: '#aacfcf' },
  warn: { label: 'Перегруз', color: '#e6d488' },
  critical: { label: 'Критично', color: '#e09a9a' },
  unknown: { label: 'Нет данных', color: '#b0b0b0' },
  weekend: { label: 'Выходной', color: '#f0f0f0' },
}
