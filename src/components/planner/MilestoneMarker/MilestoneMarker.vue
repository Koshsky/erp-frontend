<script setup lang="ts">
import { computed } from 'vue'
import { TooltipCell } from '../../common/TooltipCell'
import { dateCellIndex, cellCount } from '../calendar'
import type { MilestoneMarkerProps } from './types'

const props = withDefaults(defineProps<MilestoneMarkerProps>(), {
  color: '#fbbc04',
  variant: 'strip',
})

const markerStyle = computed<Record<string, string | number> | null>(() => {
  const index = dateCellIndex(props.anchor, props.mode, props.unit, props.date)
  if (index == null) return null
  const total = cellCount(props.anchor, props.mode, props.unit)
  const widthFactor = props.variant === 'cell' ? 1 : 0.5
  return {
    left: ((index + 0.5) / total) * 100 + '%',
    width: Math.max((widthFactor / total) * 100, 0.5) + '%',
    background: props.color,
  }
})
</script>

<template>
  <div v-if="markerStyle" class="ms-marker" :style="markerStyle">
    <TooltipCell :text="title" :multiline="true">
      <span class="ms-hit" />
      <template #popup>
        <div class="ms-popup">
          <div class="ms-popup-title">{{ title }}</div>
          <div v-if="content" class="ms-popup-content">{{ content }}</div>
        </div>
      </template>
    </TooltipCell>
  </div>
</template>

<style scoped>
.ms-marker {
  position: absolute;
  top: 2px;
  bottom: 2px;
  transform: translateX(-50%);
  border-radius: 4px;
  min-width: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  cursor: default;
}
.ms-marker :deep(.tt-trigger) {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 100%;
}
.ms-hit {
  display: block;
  width: 100%;
}
</style>

<style>
.ms-popup-title {
  font-weight: 700;
  margin-bottom: 2px;
}
.ms-popup-content {
  color: rgba(255, 255, 255, 0.85);
}
</style>
