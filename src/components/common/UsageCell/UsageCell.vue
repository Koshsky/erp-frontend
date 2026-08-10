<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    used: number
    available: number | null
    isWeekend: boolean
    /** Показывать ли подпись used/available (прячется в узких ячейках) */
    showText?: boolean
  }>(),
  {
    available: null,
    showText: true,
  },
)

type CellState = 'under' | 'full' | 'over' | 'unknown' | 'weekend'

const state = computed<CellState>(() => {
  if (props.isWeekend) return 'weekend'
  if (props.available == null) return 'unknown'
  if (props.used < props.available) return 'under'
  if (props.used === props.available) return 'full'
  return 'over'
})

/** Полный формат в ячейке; для крайних случаев (переполнение) — дублируется в тултипе */
const displayText = computed(() =>
  props.available == null ? `${props.used}` : `${props.used}/${props.available}`,
)
const tooltip = computed(() =>
  props.available == null
    ? `Занято: ${props.used}`
    : `Занято: ${props.used}/${props.available}`,
)
</script>

<template>
  <div class="uc" :class="[state, { 'uc--compact': !showText }]" :title="tooltip"><span v-if="showText">{{ displayText }}</span></div>
</template>

<style scoped>
.uc {
  width: 100%;
  height: 100%;
  text-align: center;
  font-size: 10px;
  font-weight: 600;
  min-height: 18px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 1px;
  overflow: hidden;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

/* Узкие ячейки: текст скрыт, ячейка вдвое тоньше */
.uc--compact {
  min-height: 9px;
}

/* 1. Недобор — ресурс не полностью занят */
.under {
  background: #aacfcf;
  color: #333;
}

/* 2. Идеально — ресурс занят ровно */
.full {
  background: #679b9b;
  color: #fff;
}

/* 3. Перебор — ресурса нужно больше, чем есть */
.over {
  background: #ffb6b6;
  color: #333;
}

/* 4. Выходной день — как обычная ячейка таблицы (не выделять) */
.weekend {
  background: #f0f0f0;
  color: #999;
}

/* 5. Нет данных о доступности (вне окна загрузки ±год) — нейтральная ячейка */
.unknown {
  background: #fff;
  color: #b0b0b0;
}
</style>
