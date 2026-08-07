<script setup lang="ts">
import { computed } from 'vue'
import type { TimesheetCellProps } from './types'
import { stateBackground } from '../stateColors'

const props = withDefaults(defineProps<TimesheetCellProps>(), {
  state: null,
  isWeekend: false,
  selected: false,
  showText: false,
})

const bg = computed<string>(() => {
  const s = props.state
  if (!s) {
    return props.isWeekend ? '#f0f0f0' : 'transparent'
  }
  return stateBackground(s.state_code, s.is_available, s.state_id)
})

function fmtDM(iso?: string): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

const tooltip = computed(() => {
  const s = props.state
  if (!s) return props.isWeekend ? 'Выходной' : 'Рабочий день'
  return `${s.state_name} ${fmtDM(s.start_date)}–${fmtDM(s.end_date)}`
})
</script>

<template>
  <div
    class="tsc"
    :class="{ 'tsc--selected': selected, 'tsc--show-text': showText }"
    :style="{ background: bg }"
    :title="tooltip"
  >
    <span v-if="showText && state" class="tsc-code">{{ state.state_code }}</span>
  </div>
</template>

<style scoped>
.tsc {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  cursor: cell;
}
.tsc--selected {
  outline: 2px solid #1a73e8;
  outline-offset: -2px;
  z-index: 2;
}
.tsc-code {
  font-size: 10px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.55);
  pointer-events: none;
  white-space: nowrap;
}
</style>
