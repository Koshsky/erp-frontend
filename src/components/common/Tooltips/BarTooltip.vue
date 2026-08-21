<script setup lang="ts">
import type { BarTooltipProps } from './types'

withDefaults(defineProps<BarTooltipProps>(), {
  rows: () => [],
  resources: () => [],
  accent: '',
})
</script>

<template>
  <div class="bt">
    <div class="bt-title" :style="accent ? { color: accent } : {}">{{ title }}</div>
    <div v-for="r in rows" :key="r" class="bt-row">{{ r }}</div>
    <div v-if="resources.length" class="bt-resources">
      <div v-for="(r, i) in resources" :key="i" class="bt-res">
        <span class="bt-res-dot" :style="{ background: accent || '#cfcfcf' }" />
        <span>{{ r.label }}</span>
        <template v-if="r.quantity != null"><span class="bt-res-qty">×{{ r.quantity }}</span></template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bt {
  font-size: 12px;
  line-height: 1.5;
}
.bt-title {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 2px;
}
.bt-row {
  color: #666;
  white-space: nowrap;
}
.bt-resources {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bt-res {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.bt-res-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.bt-res-qty {
  color: #999;
}
</style>
