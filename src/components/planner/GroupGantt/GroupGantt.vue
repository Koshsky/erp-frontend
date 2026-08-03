<script setup lang="ts">
import { computed } from 'vue'
import type { GroupGanttProps } from './types'
import { barCells, cellCount, toDate } from '../calendar'
import { LABEL_WIDTH } from '../layout'

const props = withDefaults(defineProps<GroupGanttProps>(), {
  headerBarHeight: 4,
})

defineSlots<{
  header(): any
  overlay(props: { headerBarHeight: number }): any
  row(props: { item: any; index: number }): any
  bar(props: { item: any; index: number; count: number }): any
}>()

function fmt(d: string | Date | number | null | undefined): string {
  return d ? toDate(d).toLocaleDateString('ru') : ''
}

/** Полупрозрачная подложка границ группы */
const groupOverlayStyle = computed(() => {
  if (!props.groupStartDate || !props.groupEndDate || !props.anchor) return null
  const span = barCells(props.anchor, props.mode, props.unit, props.groupStartDate, props.groupEndDate)
  if (!span) return null
  const total = cellCount(props.anchor, props.mode, props.unit)
  return {
    left: (span.startCell / total) * 100 + '%',
    width: Math.max(((span.endCell - span.startCell) / total) * 100, 0.5) + '%',
  }
})

const gridTemplate = computed(() => {
  const total = props.anchor ? cellCount(props.anchor, props.mode, props.unit) : 0
  return `${LABEL_WIDTH}px repeat(${total}, 1fr)`
})
</script>

<template>
  <div class="gg-block" style="gridColumn:1/-1">
    <div class="gg-grid" :style="{ gridTemplateColumns: gridTemplate }">
      <div class="c lc ph-header">
        <slot name="header" />
      </div>

      <!-- Полоса под шапкой + подложка границ -->
      <div class="header-bar-row" style="gridColumn:2/-1" :style="{ minHeight: headerBarHeight + 'px' }">
        <div v-if="groupOverlayStyle" class="group-overlay" :style="groupOverlayStyle" />
      </div>

      <template v-for="(item, index) in items" :key="'gi'+item.id">
        <div class="c lc item-label lc-start" :class="{ ta: index % 2 === 1 }">
          <slot name="row" :item="item" :index="index">
            <span class="item-title">{{ item.title }}</span>
            <div class="item-dates">{{ fmt(item.start_date) }} — {{ fmt(item.end_date) }}</div>
          </slot>
        </div>
        <div class="bar-cell" :class="{ ta: index % 2 === 1 }" style="gridColumn:2/-1">
          <!-- Подложка границ группы на каждой ячейке -->
          <div v-if="groupOverlayStyle" class="group-overlay" :style="groupOverlayStyle" />
          <slot name="bar" :item="item" :index="index" :count="items.length" />
        </div>
      </template>
    </div>

    <!-- Слой милестоунов: поверх разметки и баров, но под липкой колонкой названий -->
    <div class="gg-overlay" :style="{ left: LABEL_WIDTH + 'px' }">
      <slot name="overlay" :headerBarHeight="headerBarHeight" />
    </div>
  </div>
</template>

<style scoped>
.gg-block {
  position: relative;
}
.gg-grid {
  display: grid;
  min-width: 0;
}
.c {
  border: 1px solid #e8e8e8;
  text-align: center;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lc {
  position: sticky; left: 0; background: #fff; z-index: 10;
  text-align: left; padding: 4px 8px !important;
  border-left: none; overflow: hidden;
}

.lc-start {
  justify-content: flex-start;
}
.item-label {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: #333;
  min-height: 36px;
}
.item-title {
  font-weight: 400;
  color: #444;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ta { background: #fafafa; }
.item-dates {
  font-size: 10px; color: #999; font-weight: 400; margin-top: 1px;
}

.header-bar-row {
  position: relative; min-height: 4px;
  border: 1px solid #e8e8e8; border-top: none;
  overflow: hidden;
}

.bar-cell {
  position: relative; min-height: 36px;
  border: 1px solid #e8e8e8; border-top: none; background: #fff;
  overflow: hidden;
}
.bar-cell.ta { background: #fafafa; }

.group-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.04);
  pointer-events: none;
  z-index: 0;
}

/* Слой-оверлей милестоунов: над разметкой и барами, под липкой колонкой */
.gg-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 5;
  pointer-events: none;
}

.ph-header {
  min-height: 36px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  background: #fafafa;
  font-weight: 700;
  font-size: 13px;
  color: #333;
  border-bottom: 1px solid #ddd;
}
</style>
