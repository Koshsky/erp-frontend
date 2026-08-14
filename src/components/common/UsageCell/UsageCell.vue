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
    /** Показывать ли подпись used/available (прячется в узких ячейках) */
    showText?: boolean
    /** Отсутствующие сотрудники ресурса на днях ячейки (для тултипа) */
    absentees?: DtoResourceAbsenceResponse[]
  }>(),
  {
    available: null,
    showText: true,
    absentees: () => [],
  },
)

/** Процент загрузки: ≤100% зелёный, 100–160% жёлтый, >160% красный */
const state = computed<UsageState>(() => usageState({ used: props.used, available: props.available, isWeekend: props.isWeekend }))

/** Полный формат в ячейке; для крайних случаев (переполнение) — дублируется в тултипе */
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
/* Триггер тултипа заполняет ячейку (класс переносится на корень TooltipCell) */
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

/* Узкие ячейки: текст скрыт, ячейка вдвое тоньше */
.uc--compact {
  min-height: 9px;
}

/* 1. Норма — загрузка ≤ 100% (база: исходный зелёный #aacfcf) */
.normal {
  background: #aacfcf;
  color: #333;
}

/* 2. Перегруз — 100–160% (жёлтый, мутирован от зелёного в ту же тональность) */
.warn {
  background: #e6d488;
  color: #333;
}

/* 3. Критическая перегруз — >160% (красный, мутирован от зелёного в ту же тональность) */
.critical {
  background: #e09a9a;
  color: #333;
}

/* 4. Выходной день — как обычная ячейка таблицы (не выделять) */
.weekend {
  background: #f0f0f0;
  color: #999;
}

/* 5. Нет данных о доступности (вне окна загрузки ±год) — нейтральная ячейка */
.unknown {
  background: #fff;
  color: #b0b0b0;
}
</style>
