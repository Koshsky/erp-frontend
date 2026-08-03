<script setup lang="ts">
import { computed } from 'vue'
import { TooltipCell } from '../../common/TooltipCell'
import { dateCellIndex, cellCount } from '../calendar'
import type { MilestoneMarkerProps } from './types'

const props = withDefaults(defineProps<MilestoneMarkerProps>(), {
  color: '#fbbc04',
})

/** Бокс ячейки вехи — маркер и луч выравниваются по её центру */
const pos = computed<{ left: string; width: string } | null>(() => {
  const index = dateCellIndex(props.anchor, props.mode, props.unit, props.date)
  if (index == null) return null
  const total = cellCount(props.anchor, props.mode, props.unit)
  return {
    left: (index / total) * 100 + '%',
    width: Math.max((1 / total) * 100, 0.5) + '%',
  }
})

const markerStyle = computed<Record<string, string | number> | null>(() => {
  if (!pos.value) return null
  const height = props.headerHeight != null ? props.headerHeight - 4 : null
  return {
    background: props.color,
    ...(height != null ? { height: height + 'px' } : {}),
  }
})

const rayStyle = computed<Record<string, string | number> | null>(() => {
  if (!pos.value || props.headerHeight == null) return null
  return {
    background: props.color,
    top: props.headerHeight + 'px',
  }
})
</script>

<template>
  <div v-if="pos" class="ms" :style="{ left: pos.left, width: pos.width }">
    <div class="ms-marker" :style="markerStyle">
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
    <div v-if="rayStyle" class="ms-ray" :style="rayStyle" />
  </div>
</template>

<style scoped>
.ms {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
}
/* Маркер вехи: закруглённый прямоугольник в половину ширины ячейки по центру */
.ms-marker {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 2px;
  bottom: 2px;
  width: 50%;
  border-radius: 4px;
  min-width: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  cursor: default;
  pointer-events: auto;
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
/* Луч-древко: сплошная линия цвета вехи по центру ячейки, от низа шапки до низа блока */
.ms-ray {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 2px;
  opacity: 0.9;
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
