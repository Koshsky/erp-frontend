<script setup lang="ts">
import type { GanttTooltipProps } from './types'

withDefaults(defineProps<GanttTooltipProps>(), {
  rows: () => [],
  resources: () => [],
})
</script>

<template>
  <div class="gb-tooltip">
    <div class="gb-tooltip-title">{{ title }}</div>
    <div v-for="r in rows" :key="r" class="gb-tooltip-row">{{ r }}</div>
    <div v-if="resources.length" class="gb-tooltip-resources">
      <div v-for="(r, i) in resources" :key="i" class="gb-tooltip-row">
        {{ r.label }}<template v-if="r.quantity != null"> × {{ r.quantity }}</template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gb-tooltip {
  font-size: 12px;
  line-height: 1.45;
}
.gb-tooltip-title {
  font-weight: 700;
  margin-bottom: 2px;
}
.gb-tooltip-row {
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
}
.gb-tooltip-resources {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}
</style>
