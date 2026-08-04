<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  used: number
  total: number
  isWeekend: boolean
}>()

type CellState = 'under' | 'full' | 'over' | 'weekend'

const state = computed<CellState>(() => {
  if (props.isWeekend) return 'weekend'
  if (props.used < props.total) return 'under'
  if (props.used === props.total) return 'full'
  return 'over'
})

/** Полный формат в ячейке; для крайних случаев (переполнение) — дублируется в тултипе */
const displayText = computed(() => `${props.used}/${props.total}`)
const tooltip = computed(() => `Занято: ${props.used}/${props.total}`)
</script>

<template>
  <div class="uc" :class="state" :title="tooltip">{{ displayText }}</div>
</template>

<style scoped>
.uc {
  width: 100%;
  height: 100%;
  text-align: center;
  font-size: 10px;
  font-weight: 600;
  min-height: 24px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 1px;
  overflow: hidden;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
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

/* 4. Выходной день */
.weekend {
  background: #fde2e2 !important;
  color: #333;
}
</style>
