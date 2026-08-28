<script setup lang="ts">
import { computed } from 'vue'
import { usageState } from './usageState'
import type { UsageState } from './usageState'
import { UsageTooltip } from '../Tooltips'
import TooltipCell from '../TooltipCell/TooltipCell.vue'
import type { DtoResourceAbsenceResponse } from '@/api'

const props = withDefaults(
  defineProps<{
    used: number
    available: number | null
    isWeekend: boolean
    /** Whether to show the used/available caption (hidden in narrow cells) */
    showText?: boolean
    /** Resource employees absent on the cell's days (for the tooltip) */
    absentees?: DtoResourceAbsenceResponse[]
  }>(),
  {
    available: null,
    showText: true,
    absentees: () => [],
  },
)

/** Load percentage: ≤100% green, 100–160% yellow, >160% red */
const state = computed<UsageState>(() => usageState({ used: props.used, available: props.available, isWeekend: props.isWeekend }))

/** Full format in the cell; for edge cases (overflow) it is duplicated in the tooltip */
const displayText = computed(() =>
  props.available == null ? `${props.used}` : `${props.used}/${props.available}`,
)
</script>

<template>
  <TooltipCell class="uc" :multiline="true">
    <div class="uc-inner" :class="[state, { 'uc--compact': !showText }]"><span v-if="showText">{{ displayText }}</span></div>
    <template #popup>
      <UsageTooltip :used="used" :available="available" :absentees="absentees" />
    </template>
  </TooltipCell>
</template>

<style scoped>
/* Tooltip trigger fills the cell (the class is forwarded to the TooltipCell root) */
.uc {
  display: flex;
  width: 100%;
  height: 100%;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}

.uc-inner {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 10px;
  font-weight: 600;
  min-height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 1px;
  overflow: hidden;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

/* Narrow cells: text hidden, cell twice as thin */
.uc--compact {
  min-height: 9px;
}

/* 1. Normal — load ≤ 100% (base: original green #aacfcf) */
.normal {
  background: #aacfcf;
  color: #333;
}

/* 2. Overload — 100–160% (yellow, mutated from green into the same tone) */
.warn {
  background: #e6d488;
  color: #333;
}

/* 3. Critical overload — >160% (red, mutated from green into the same tone) */
.critical {
  background: #e09a9a;
  color: #333;
}

/* 4. Weekend — like a regular table cell (do not highlight) */
.weekend {
  background: #f0f0f0;
  color: #999;
}

/* 5. No availability data (outside the ±1-year load window) — neutral cell */
.unknown {
  background: #fff;
  color: #b0b0b0;
}
</style>
