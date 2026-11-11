import { computed, ref } from 'vue'
import type { PlanningUnit } from '../components/planner/calendar'
import { viewSettings } from '../settings'
import { t } from '../i18n'

export interface UnitOption {
  value: PlanningUnit
  label: string
}

/**
 * Timeline scale options of the planning pages. The labels are getters resolved
 * from the active locale at every read — consumers map the list inside a
 * computed, so a language switch re-renders their menus (the labels read the
 * reactive locale through t()).
 */
export const UNIT_OPTIONS: UnitOption[] = [
  { value: 'day', get label() { return t('plannerViews.unit.day') } },
  { value: 'decade', get label() { return t('plannerViews.unit.decade') } },
]

/** Timeline scale and anchor for planning diagrams (shared across three pages) */
export function usePlanningOrigin() {
  // The opening unit comes from the user's view settings ("Единица календаря по
  // умолчанию"); in-session the unit is still freely switchable via the header.
  const unit = ref<PlanningUnit>(
    viewSettings.defaultUnit === 'decade' ? 'decade' : 'day',
  )

  /** Timeline anchor: two days before today — so on open the first columns are the day before yesterday, yesterday */
  const origin = computed(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)
  })

  /** Reactive option list (labels follow the interface language). */
  const unitOptions = computed<UnitOption[]>(() => UNIT_OPTIONS)

  return { unit, origin, unitOptions }
}