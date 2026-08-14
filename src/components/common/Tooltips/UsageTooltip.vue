<script setup lang="ts">
import { computed } from 'vue'
import { usageState, usagePercent, USAGE_STATE_META } from '../UsageCell/usageState'
import type { UsageTooltipProps } from './types'

const props = defineProps<UsageTooltipProps>()

const state = computed(() => usageState({ used: props.used, available: props.available }))
const pct = computed(() => usagePercent(props.used, props.available))
const meta = computed(() => USAGE_STATE_META[state.value])

const fraction = computed(() =>
  props.available == null ? `${props.used}` : `${props.used}/${props.available}`,
)
const percent = computed(() => (pct.value == null ? '' : `(${Math.round(pct.value)}%)`))
</script>

<template>
  <div class="ut">
    <span class="ut-marker" :style="{ background: meta.color }" />
    <div class="ut-body">
      <div class="ut-fraction">{{ fraction }} <span class="ut-pct">{{ percent }}</span></div>
      <div class="ut-label" :style="{ color: meta.color }">{{ meta.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.ut {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
}
.ut-marker {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}
.ut-body {
  display: flex;
  flex-direction: column;
}
.ut-fraction {
  font-weight: 700;
  white-space: nowrap;
}
.ut-pct {
  font-weight: 400;
  color: #999;
}
.ut-label {
  font-size: 11px;
}
</style>
