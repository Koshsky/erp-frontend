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

const displayText = computed(() => `${props.used}/${props.total}`)
</script>

<template>
  <div class="uc" :class="state">{{ displayText }}</div>
</template>

<style scoped>
.uc {
  border: 1px solid #e8e8e8;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
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
