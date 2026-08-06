<script setup lang="ts">
import { computed } from 'vue'
import type { TimelineCtx } from '../../../composables/useInfiniteTimeline'
import { cellIndexForDate } from '../calendar'
import { LABEL_WIDTH, headerHeight } from '../layout'

const props = defineProps<{
  t: TimelineCtx
}>()

const dowMap = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

/** Подпись числа ячейки: для дня — число; для декады — диапазон дней (1-10, 11-20, 21-конец) */
function numLabel(i: number): string {
  const s = props.t.cellStart(i)
  const e = props.t.cellEnd(i)
  return s.getDate() === e.getDate() ? s.getDate().toString() : `${s.getDate()}-${e.getDate()}`
}

function monthLabel(d: Date): string {
  const m = d.toLocaleDateString('ru', { month: 'long' })
  return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear()
}

/** Месяцы с объединением ячеек — метка центрируется по ПОЛНОЙ длине месяца
 *  (от первой до последней ячейки месяца), а не по видимому окну, чтобы не «плавала» при прокрутке */
const monthGroups = computed(() => {
  const out: { key: string; label: string; from: number; to: number }[] = []
  const seen = new Set<string>()
  for (const i of props.t.visibleIndices) {
    const d = props.t.cellStart(i)
    const key = d.getFullYear() + '-' + d.getMonth()
    if (seen.has(key)) continue
    seen.add(key)
    const firstOfMonth = cellIndexForDate(props.t.origin, props.t.unit, new Date(d.getFullYear(), d.getMonth(), 1))
    const lastOfMonth = cellIndexForDate(props.t.origin, props.t.unit, new Date(d.getFullYear(), d.getMonth() + 1, 0))
    out.push({ key, label: monthLabel(d), from: firstOfMonth, to: lastOfMonth })
  }
  return out
})

const showWeekdayRow = computed(() => props.t.unit === 'day')
</script>

<template>
  <div class="tg-head" :style="{ height: headerHeight(t.unit) + 'px' }">
    <div class="th-corner" :style="{ width: LABEL_WIDTH + 'px' }"></div>

    <div v-for="m in monthGroups" :key="'m' + m.from"
      class="th-month"
      :style="{ left: t.cellLeft(m.from) + 'px', width: (m.to - m.from + 1) * t.cellPx + 'px' }">
      {{ m.label }}
    </div>

    <div v-for="i in t.visibleIndices" :key="'n' + i"
      class="th-num"
      :style="{ left: t.cellLeft(i) + 'px', width: t.cellPx + 'px' }">
      {{ numLabel(i) }}
    </div>

    <template v-if="showWeekdayRow">
      <div v-for="i in t.visibleIndices" :key="'w' + i"
        class="th-wd"
        :style="{ left: t.cellLeft(i) + 'px', width: t.cellPx + 'px' }">
        {{ dowMap[t.cellStart(i).getDay()] }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.tg-head {
  position: sticky;
  top: 0;
  z-index: 30;
  background: #f8f9fa;
}
.th-corner {
  position: sticky;
  left: 0;
  height: 100%;
  background: #f8f9fa;
  z-index: 3;
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-weight: 700;
  font-size: 12px;
  color: #444;
  border-right: 1px solid #e0e0e0;
}
.th-month {
  position: absolute;
  top: 2px;
  height: 18px;
  font-size: 11px;
  font-weight: 600;
  color: #444;
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fa;
}
.th-num {
  position: absolute;
  top: 20px;
  height: 18px;
  font-size: 10px;
  color: #666;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-left: 1px solid #e6e6e6;
  background: #f8f9fa;
}
.th-wd {
  position: absolute;
  top: 38px;
  height: 18px;
  font-size: 10px;
  color: #999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-left: 1px solid #e6e6e6;
  background: #f8f9fa;
}
</style>
