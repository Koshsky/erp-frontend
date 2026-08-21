<script setup lang="ts">
import { computed } from 'vue'
import { cellIndexForDate } from '../calendar'
import { DAY_MS } from '../../../utils'
import type { TodayLineProps } from './types'

const props = withDefaults(defineProps<TodayLineProps>(), {
  color: '#e53935',
  width: 2,
  offset: 0,
})

/** Абсолютный индекс ячейки, содержащей сегодняшний день */
const todayIdx = computed(() =>
  cellIndexForDate(props.timeline.origin, props.timeline.unit, new Date()),
)
/** Луч скрывается вне видимого окна (±запас, как у баров) */
const visible = computed(() => {
  const t = props.timeline
  return todayIdx.value > t.windowStart - 4 && todayIdx.value < t.windowStart + t.viewportCells + 4
})

/**
 * Позиция границы «вчера/сегодня» в content-пикселях:
 * день — левый край ячейки «сегодня» (граница суток); декада — дробная
 * позиция текущего дня внутри ячейки-декады.
 */
const left = computed<number | null>(() => {
  if (!visible.value) return null
  const t = props.timeline
  const i = todayIdx.value
  const frac =
    t.unit === 'decade'
      ? (new Date().getTime() - t.cellStart(i).getTime()) / (t.cellEnd(i).getTime() - t.cellStart(i).getTime() + DAY_MS)
      : 0
  return t.cellLeft(i) + frac * t.cellPx + props.offset
})

const lineStyle = computed<Record<string, string> | null>(() =>
  left.value != null
    ? {
        left: left.value + 'px',
        width: props.width + 'px',
        background: props.color,
      }
    : null,
)
</script>

<template>
  <div v-if="lineStyle" class="tl-line" :style="lineStyle" />
</template>

<style scoped>
.tl-line {
  position: absolute;
  top: 0;
  bottom: 0;
  /* Свой уровень: над контентом (бары 2, вехи 3) и ячейками ресурсов (20),
     но под календарной шапкой (30) и боковой панелью (65+): шапка, коды
     ресурсов, merged/строчные лейблы, полоса вех и корнер остаются поверх
     линии текущей даты */
  z-index: 25;
  pointer-events: none;
}
</style>
