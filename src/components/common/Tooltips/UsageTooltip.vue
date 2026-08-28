<script setup lang="ts">
import { computed } from 'vue'
import { usageState, usagePercent, USAGE_STATE_META } from '../UsageCell/usageState'
import type { UsageTooltipProps } from './types'
import type { DtoResourceAbsenceResponse } from '@/api'

const props = withDefaults(defineProps<UsageTooltipProps>(), {
  absentees: () => [],
})

const state = computed(() => usageState({ used: props.used, available: props.available }))
const pct = computed(() => usagePercent(props.used, props.available))
const meta = computed(() => USAGE_STATE_META[state.value])

const fraction = computed(() =>
  props.available == null ? `${props.used}` : `${props.used}/${props.available}`,
)
const percent = computed(() => (pct.value == null ? '' : `(${Math.round(pct.value)}%)`))

/** DD.MM of the absence period dates */
function fmtDM(iso?: string): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

/** "Name — Reason (dates)" line for an absent employee */
function absenceLabel(a: DtoResourceAbsenceResponse): string {
  return `${a.user_name} — ${a.state_name} (${fmtDM(a.start_date)}–${fmtDM(a.end_date)})`
}
</script>

<template>
  <div class="ut">
    <span class="ut-marker" :style="{ background: meta.color }" />
    <div class="ut-body">
      <div class="ut-fraction">{{ fraction }} <span class="ut-pct">{{ percent }}</span></div>
      <div class="ut-label" :style="{ color: meta.color }">{{ meta.label }}</div>
    </div>
    <div v-if="absentees.length" class="ut-absences">
      <div class="ut-absences-title">Отсутствуют:</div>
      <div v-for="(a, i) in absentees" :key="i" class="ut-absence">{{ absenceLabel(a) }}</div>
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
.ut-absences {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 6px;
  border-left: 1px solid #e8e8e8;
}
.ut-absences-title {
  font-weight: 700;
  white-space: nowrap;
}
.ut-absence {
  color: #666;
  white-space: nowrap;
}
</style>
