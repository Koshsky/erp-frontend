<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  startDate: Date | number
  endDate: Date | number
}>()

function toDate(v: Date | number): Date {
  return v instanceof Date ? v : new Date(v)
}

const dayList = computed<Date[]>(() => {
  const days: Date[] = []
  const cur = new Date(toDate(props.startDate))
  const end = new Date(toDate(props.endDate))
  while (cur <= end) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
})

function dd(d: Date): string {
  return d.toLocaleDateString('ru', { day: 'numeric' })
}

const dowMap = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

interface MonthHeader {
  label: string
  cs: number
  ce: number
}

const monthHeaders = computed<MonthHeader[]>(() => {
  const dl = dayList.value
  if (!dl.length) return []
  const hh: MonthHeader[] = []
  let cm = -1
  for (let i = 0; i < dl.length; i++) {
    const m = dl[i].getMonth()
    if (m !== cm) {
      hh.push({
        label: dl[i].toLocaleDateString('ru', { month: 'long' }),
        cs: i + 2,
        ce: i + 2,
      })
      cm = m
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
  <div v-for="(d,i) in dayList" :key="'d'+i"
    class="c hc dc"
  >{{ dd(d) }}</div>

  <div class="c hc lc"></div>
  <div v-for="(d,i) in dayList" :key="'dw'+i"
    class="c hc wc"
  >{{ dowMap[d.getDay()] }}</div>
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
.mc { text-transform: capitalize; font-size: 11px; min-height: 28px; }
.dc { font-size: 11px; min-height: 26px; }
.wc { font-size: 10px; color: #666; min-height: 24px; }
</style>
