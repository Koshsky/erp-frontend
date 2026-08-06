<script setup lang="ts">
import { computed } from 'vue'
import TooltipCell from '../../../../common/TooltipCell/TooltipCell.vue'
import UsageCell from '../UsageCell/UsageCell.vue'
import type { TimelineCtx } from '@/composables/timeline-context'
import { LABEL_WIDTH, headerHeight } from '@/components/planner/layout'
import type { Resource } from './types'

const props = defineProps<{
  t: TimelineCtx
  resources: Resource[]
  usageFn: (resourceId: number, day: Date) => number
}>()

interface CellUsage {
  used: number
  isWeekend: boolean
}

function cellUsage(resourceId: number, idx: number): CellUsage {
  let peak = 0
  let weekend = true
  const start = props.t.cellStart(idx)
  const end = props.t.cellEnd(idx)
  const cur = new Date(start)
  while (cur <= end) {
    const wd = cur.getDay() === 0 || cur.getDay() === 6
    if (!wd) weekend = false
    peak = Math.max(peak, props.usageFn(resourceId, cur))
    cur.setDate(cur.getDate() + 1)
  }
  return { used: peak, isWeekend: weekend }
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
</script>

<template>
  <div class="rs-block" :style="{ top: headerHeight(t.unit, t.cellPx) + 'px' }">
    <template v-for="rc in resourceCells" :key="'r' + rc.res.id">
      <div class="rs-row" :class="{ 'rs-row--compact': !showText }">
        <div class="rs-label" :style="{ width: LABEL_WIDTH + 'px' }">
          <TooltipCell v-if="showText" :text="`${rc.res.title} (всего: ${rc.res.quantity})`">
            <span class="rs-code">{{ rc.res.code }}</span>
          </TooltipCell>
        </div>
        <div
          v-for="(u, k) in rc.cells"
          :key="'rc' + t.visibleIndices[k]"
          class="rs-cell"
          :style="{ left: t.cellLeft(t.visibleIndices[k]) + 'px', width: t.cellPx + 'px' }"
        >
          <UsageCell :used="u.used" :total="rc.res.quantity" :isWeekend="u.isWeekend" :show-text="showText" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Ресурсный заголовок прилипает сразу под календарным заголовком при вертикальной прокрутке */
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
.rs-label {
  position: sticky;
  left: 0;
  height: 100%;
  background: #fff;
  z-index: 10;
  display: flex;
  align-items: center;
  padding: 0 6px;
  box-sizing: border-box;
  font-size: 11px;
  cursor: default;
  border-bottom: 1px solid #e8e8e8;
}
.rs-code {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.5px;
}
.rs-cell {
  position: absolute;
  top: 0;
  bottom: 0;
  padding: 0;
  background: #fff;
}
</style>
