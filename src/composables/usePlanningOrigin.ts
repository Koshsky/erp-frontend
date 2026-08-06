import { computed, ref } from 'vue'
import type { PlanningUnit } from '../components/planner/calendar'

export const UNIT_OPTIONS: { value: PlanningUnit; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'decade', label: 'Декада' },
]

/** Масштаб шкалы и якорь для диаграмм планирования (единые для трёх страниц) */
export function usePlanningOrigin() {
  const unit = ref<PlanningUnit>('day')

  /** Якорь шкалы: первое число предыдущего месяца от сегодня */
  const origin = computed(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() - 1, 1)
  })

  return { unit, origin, unitOptions: UNIT_OPTIONS }
}
