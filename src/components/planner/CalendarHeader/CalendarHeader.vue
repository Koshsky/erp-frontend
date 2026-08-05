<script setup lang="ts">
import { computed } from 'vue'
import type { PlanningMode, PlanningUnit } from '../calendar'
import { buildCells } from '../calendar'

const props = defineProps<{
  anchor: Date | number
  mode: PlanningMode
  unit: PlanningUnit
}>()

const cells = computed(() => buildCells(props.anchor, props.mode, props.unit))

const dowMap = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

/** Подпись числа — диапазон дней ячейки («1-10», «11-20», «21-31»);
 * для однодневных ячеек (день) — просто число. Декады не пересекают месяц. */
function numLabel(i: number): string {
  const { start, end } = cells.value[i]
  return start.getDate() === end.getDate() ? start.getDate().toString() : `${start.getDate()}-${end.getDate()}`
}

/** Название месяца с годом: «Февраль 2026» (без суффикса «г.», капитализация в JS) */
function monthLabel(d: Date): string {
  const month = d.toLocaleDateString('ru', { month: 'long' })
  return month.charAt(0).toUpperCase() + month.slice(1) + ' ' + d.getFullYear()
}

/** Подпись нижней строки — день недели (для дней) */
function subLabel(i: number): string {
  return props.unit === 'day' ? dowMap[cells.value[i].start.getDay()] : ''
}

/** Третий ряд (день недели) показываем только для дневных ячеек */
const showSubRow = computed(() => props.unit === 'day')

interface MonthHeader {
  label: string
  cs: number
  ce: number
}

/** Месяцы с учётом перехода через год — группировка по паре (год, месяц) */
const monthHeaders = computed<MonthHeader[]>(() => {
  const list = cells.value
  if (!list.length) return []
  const hh: MonthHeader[] = []
  let key = ''
  for (let i = 0; i < list.length; i++) {
    const d = list[i].start
    const k = d.getFullYear() + '-' + d.getMonth()
    if (k !== key) {
      hh.push({
        label: monthLabel(d),
        cs: i + 2,
        ce: i + 2,
      })
      key = k
    } else {
      hh[hh.length - 1].ce = i + 2
    }
  }
  return hh
})
</script>

<template>
  <div class="c hc lc"></div>
  <div v-for="(mh,i) in monthHeaders" :key="'mh'+i"
    class="c hc mc"
    :style="{ gridColumn: mh.cs + ' / ' + (mh.ce+1) }"
  >{{ mh.label }}</div>

  <div class="c hc lc"></div>
  <div v-for="(c,i) in cells" :key="'n'+i"
    class="c hc dc"
  >{{ numLabel(i) }}</div>

  <template v-if="showSubRow">
    <div class="c hc lc"></div>
    <div v-for="(c,i) in cells" :key="'s'+i"
      class="c hc wc"
    >{{ subLabel(i) }}</div>
  </template>
</template>

<style scoped>
.c {
  border: 1px solid #e8e8e8;
  text-align: center;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hc { font-weight: 600; background: #f8f9fa; color: #444; }
.lc {
  position: sticky; left: 0; background: #f8f9fa; z-index: 2;
  text-align: left; padding: 4px 8px !important;
  border-left: none; justify-content: flex-start;
}
.mc { font-size: 11px; min-height: 20px; }
.dc { font-size: 11px; min-height: 18px; }
.wc { font-size: 10px; color: #666; min-height: 16px; }
</style>
