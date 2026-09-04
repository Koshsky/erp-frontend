import { computed, ref } from 'vue'
import type { PlanningUnit } from '../components/planner/calendar'

export const UNIT_OPTIONS: { value: PlanningUnit; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'decade', label: 'Декада' },
]

/** Timeline scale and anchor for planning diagrams (shared across three pages) */
export function usePlanningOrigin() {
  const unit = ref<PlanningUnit>('day')

  /** Timeline anchor: two days before today — so on open the first columns are the day before yesterday, yesterday */
  const origin = computed(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)
  })

  return { unit, origin, unitOptions: UNIT_OPTIONS }
}
