<script setup lang="ts">
import { computed } from 'vue'
import TooltipCell from '../TooltipCell/TooltipCell.vue'
import UsageCell from '../UsageCell/UsageCell.vue'
import type { TimelineCtx } from '@/composables/timeline-context'
import { LABEL_WIDTH, headerHeight } from '@/components/planner/layout'
import type { Resource } from './types'

const props = defineProps<{
  t: TimelineCtx
  resources: Resource[]
  usageFn: (resourceId: number, day: Date) => number
  availableFn: (resourceId: number, day: Date) => number | null
}>()

interface CellUsage {
  used: number
  available: number | null
  isWeekend: boolean
}

function cellUsage(resourceId: number, idx: number): CellUsage {
  let peak = 0
  let minAvail: number | null = null
  let hasUnknown = false
  let weekend = true
  const start = props.t.cellStart(idx)
  const end = props.t.cellEnd(idx)
  const cur = new Date(start)
  while (cur <= end) {
    const wd = cur.getDay() === 0 || cur.getDay() === 6
    if (!wd) weekend = false
    peak = Math.max(peak, props.usageFn(resourceId, cur))
    const avail = props.availableFn(resourceId, cur)
    if (avail == null) {
      hasUnknown = true
    } else if (minAvail == null || avail < minAvail) {
      minAvail = avail
    }
    cur.setDate(cur.getDate() + 1)
  }
  return { used: peak, available: hasUnknown ? null : minAvail, isWeekend: weekend }
}

/** Занятость по ресурсам и видимым ячейкам (пик дневной загрузки внутри ячейки) */
const resourceCells = computed(() =>
  props.resources.map((res) => ({
    res,
    cells: props.t.visibleIndices.map((i) => cellUsage(res.id, i)),
  })),
)

/** Ячейки слишком узкие — прячем текст (коды ресурсов и числа загрузки),
 *  но сам блок с раскрашенными ячейками оставляем видимым */
const showText = computed(() => props.t.cellPx >= 12)

/** Высота строки ресурса и суммарная высота слоя кодов (для отрицательного margin) */
const rowH = computed(() => (showText.value ? 18 : 9))
const labelsH = computed(() => resourceCells.value.length * rowH.value)
</script>

<template>
  <!-- Слой кодов ресурсов: отдельный sticky-элемент боковой панели (z 80), вне
       stacking context ресурсного блока — выше линии текущей даты (25) -->
  <div
    class="rs-labels"
    :style="{
      top: headerHeight(t.unit, t.cellPx) + 'px',
      width: LABEL_WIDTH + 'px',
      height: labelsH + 'px',
      marginBottom: '-' + labelsH + 'px',
    }"
  >
    <div
      v-for="rc in resourceCells"
      :key="'rl' + rc.res.id"
      class="rs-label"
      :class="{ 'rs-label--compact': !showText }"
    >
      <TooltipCell v-if="showText" :text="`${rc.res.title} (всего: ${rc.res.employeesCount})`">
        <span class="rs-code">{{ rc.res.code }}</span>
      </TooltipCell>
    </div>
  </div>

  <!-- Блок ячеек загрузки «4/5»: липнет под шапкой календаря, ниже линии текущей даты -->
  <div class="rs-block" :style="{ top: headerHeight(t.unit, t.cellPx) + 'px' }">
    <template v-for="rc in resourceCells" :key="'r' + rc.res.id">
      <div class="rs-row" :class="{ 'rs-row--compact': !showText }">
        <div
          v-for="(u, k) in rc.cells"
          :key="'rc' + t.visibleIndices[k]"
          class="rs-cell"
          :style="{ left: t.cellLeft(t.visibleIndices[k]) + 'px', width: t.cellPx + 'px' }"
        >
          <UsageCell :used="u.used" :available="u.available" :isWeekend="u.isWeekend" :show-text="showText" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Слой кодов ресурсов — боковая панель: липнет к левому и верхнему краю (под шапкой
 * календаря), лежит выше линии текущей даты (25). Высота и отрицательный margin
 * задаются инлайном, чтобы не сдвигать блок ячеек. */
.rs-labels {
  position: sticky;
  left: 0;
  background: #fff;
  z-index: 80;
  box-sizing: border-box;
}
.rs-label {
  height: 18px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  box-sizing: border-box;
  font-size: 11px;
  cursor: default;
  border-bottom: 1px solid #e8e8e8;
}
.rs-label--compact {
  height: 9px;
}
.rs-code {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.5px;
}
/* Блок ячеек загрузки «4/5»: липнет сразу под календарным заголовком.
 * z 20 — выше контента (бары 2, вехи 3), но ниже линии текущей даты (25). */
.rs-block {
  position: sticky;
  z-index: 20;
  background: #fff;
}
.rs-row {
  position: relative;
  height: 18px;
  background: #fff;
}
/* Текст скрыт (узкие ячейки) — строка ресурса вдвое тоньше, остаётся только заливка */
.rs-row--compact {
  height: 9px;
}
.rs-cell {
  position: absolute;
  top: 0;
  bottom: 0;
  padding: 0;
  background: #fff;
}
</style>
