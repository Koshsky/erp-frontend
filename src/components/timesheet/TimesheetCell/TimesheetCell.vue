<script setup lang="ts">
import { computed } from 'vue'
import type { TimesheetCellProps } from './types'
import { stateBackground } from '../stateColors'
import { TooltipCell } from '@/components/common/TooltipCell'
import { InfoTooltip } from '@/components/common/Tooltips'

const props = withDefaults(defineProps<TimesheetCellProps>(), {
  state: null,
  isWeekend: false,
  selected: false,
  showText: false,
  selectionRange: null,
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

function fmtFull(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Colored state marker (no marker for an empty day) */
const marker = computed<string | null>(() => {
  const s = props.state
  if (!s) return null
  return stateBackground(s.state_code, s.is_available, s.state_id)
})

const period = computed(() => {
  const s = props.state
  if (!s) return ''
  return `${fmtDM(s.start_date)}–${fmtDM(s.end_date)}`
})

const emptyLabel = computed(() => (props.isWeekend ? 'Выходной' : 'Рабочий день'))
</script>

<template>
  <TooltipCell class="tsc" :multiline="true">
    <div
      class="tsc-inner"
      :class="{ 'tsc--selected': selected, 'tsc--show-text': showText }"
      :style="{ background: bg }"
    >
      <span v-if="showText && state" class="tsc-code">{{ state.state_code }}</span>
    </div>
    <template #popup>
      <!-- While the cell is part of an active selection, show the fragment date
           range instead of the per-day info (assignment feedback) -->
      <InfoTooltip
        v-if="selectionRange"
        title="Выделенный фрагмент"
        :lines="[`${fmtFull(selectionRange.start)} — ${fmtFull(selectionRange.end)}`]"
      />
      <InfoTooltip
        v-else
        :title="state ? state.state_name : emptyLabel"
        :lines="state ? [period] : []"
        :marker="marker"
      />
    </template>
  </TooltipCell>
</template>

<style scoped>
.tsc {
  display: flex;
  width: 100%;
  height: 100%;
  cursor: cell;
}
.tsc-inner {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
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
