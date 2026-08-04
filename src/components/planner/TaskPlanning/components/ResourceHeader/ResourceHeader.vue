<script setup lang="ts">
import { computed } from 'vue'
import TooltipCell from '../../../../common/TooltipCell/TooltipCell.vue'
import UsageCell from '../UsageCell/UsageCell.vue'
import { buildCells } from '../../../calendar'
import type { CalendarCell, PlanningMode, PlanningUnit } from '../../../calendar'
import type { Resource } from './types'

const props = defineProps<{
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
  resources: Resource[]
  usageFn: (resourceId: number, day: Date) => number
}>()

const cells = computed(() => buildCells(props.anchor, props.mode, props.unit))

interface CellUsage {
  used: number
  isWeekend: boolean
}

function cellUsage(resourceId: number, cell: CalendarCell): CellUsage {
  let peak = 0
  let weekend = true
  const cur = new Date(cell.start)
  while (cur <= cell.end) {
    const wd = cur.getDay() === 0 || cur.getDay() === 6
    if (!wd) weekend = false
    peak = Math.max(peak, props.usageFn(resourceId, cur))
    cur.setDate(cur.getDate() + 1)
  }
  return { used: peak, isWeekend: weekend }
}

/** Занятость по ресурсам и ячейкам: пик дневной загрузки внутри ячейки */
const resourceCells = computed(() =>
  props.resources.map((res) => ({
    res,
    cells: cells.value.map((cell) => cellUsage(res.id, cell)),
  })),
)
</script>

<template>
  <template v-for="rc in resourceCells" :key="'r'+rc.res.id">
    <div class="c lc rl">
      <TooltipCell :text="`${rc.res.title} (всего: ${rc.res.quantity})`">
      <span class="rt">{{ rc.res.code }}</span>
      </TooltipCell>
    </div>
    <div v-for="(u,i) in rc.cells" :key="'rc'+i" class="c" style="padding:0!important">
      <UsageCell
        :used="u.used"
        :total="rc.res.quantity"
        :isWeekend="u.isWeekend"
      />
    </div>
  </template>
</template>

<style scoped>
.c {
  border: 1px solid #e8e8e8;
  text-align: center;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lc {
  position: sticky; left: 0; background: #fff; z-index: 2;
  text-align: left; padding: 2px 6px !important;
  border-left: none;
  overflow: visible;
}
.rl {
  overflow: visible;
  display: flex;
  align-items: center;
  min-height: 24px;
  cursor: default;
}
.rt {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.5px;
}
</style>
