<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import GanttBar from '../../../../../GanttBar/GanttBar.vue'
import type { Task } from './types'
import type { PlanningMode, PlanningUnit } from '../../../../../calendar'
import { toDate } from '../../../../../calendar'

const props = withDefaults(
  defineProps<{
    anchor: Date | number | null
    mode: PlanningMode
    unit: PlanningUnit
    task: Task
    draggable?: boolean
    /** Границы процесса — ограничивают перетаскивание задачи */
    groupStartDate?: string | Date | number | null
    groupEndDate?: string | Date | number | null
  }>(),
  {
    draggable: true,
    groupStartDate: null,
    groupEndDate: null,
  },
)

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  edit: []
}>()

const dateRange = computed(() =>
  `${toDate(props.task.start_date).toLocaleDateString('ru')} — ${toDate(props.task.end_date).toLocaleDateString('ru')}`,
)

/** Название ресурса для бейджа: код, при его отсутствии — полное название */
function badgeLabel(r: { code?: string; title?: string }): string {
  return r.code || r.title || '?'
}

// === Стопка бейджей ресурсов ===
// Бейджи стоят рядом, пока умещаются в ширину бара вместе с полным названием задачи.
// Если не умещаются — накладываются друг на друга (стопка), при наведении виден тултип бара.
const contentRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const badgesRef = ref<HTMLElement | null>(null)
const stacked = ref(false)

let resizeObserver: ResizeObserver | null = null

function updateStacked() {
  const content = contentRef.value
  const title = titleRef.value
  const badges = badgesRef.value
  if (!content || !title || !badges) return
  const available = content.clientWidth - title.scrollWidth
  stacked.value = badges.scrollWidth > available
}

onMounted(() => {
  updateStacked()
  resizeObserver = new ResizeObserver(updateStacked)
  if (contentRef.value) resizeObserver.observe(contentRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

// После обновления набора ресурсов (назначение/снятие) пересчитываем укладку
watch(
  () => props.task.resources,
  () => requestAnimationFrame(updateStacked),
)
</script>

<template>
  <GanttBar
    :anchor="anchor!"
    :mode="mode"
    :unit="unit"
    :startDate="task.start_date"
    :endDate="task.end_date"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @edit="() => emit('edit')"
  >
    <span ref="contentRef" class="tb-content">
      <span ref="titleRef" class="tb-title">{{ task.title }}</span>
      <span ref="badgesRef" class="tb-badges" :class="{ 'is-stacked': stacked }">
        <span
          v-for="r in task.resources"
          :key="r.resource_id"
          class="tb-badge"
          :title="r.title || r.code"
        >{{ badgeLabel(r) }}×{{ r.quantity }}</span>
      </span>
    </span>
    <template #tooltip>
      <div class="gb-tooltip">
        <div class="gb-tooltip-title">{{ task.title }}</div>
        <div class="gb-tooltip-row">{{ dateRange }}</div>
        <div v-if="task.resources && task.resources.length" class="gb-tooltip-resources">
          <div v-for="r in task.resources" :key="r.resource_id" class="gb-tooltip-row">
            {{ r.title || r.code }} × {{ r.quantity }}
          </div>
        </div>
      </div>
    </template>
  </GanttBar>
</template>

<style scoped>
.tb-content {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.tb-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.tb-badges {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
}
.tb-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
  color: #fff;
  background: rgba(0, 0, 0, 0.22);
  border-radius: 10px;
  padding: 0 7px;
  margin-left: 6px;
  white-space: nowrap;
  pointer-events: none;
}
/* Бейджи не влезают рядом — складываем их стопкой: каждый следующий
   наезжает на предыдущий, ховер по бару показывает тултип со всеми ресурсами */
.tb-badges .tb-badge:first-child {
  margin-left: 0;
}
.tb-badges.is-stacked .tb-badge {
  margin-left: -7px;
}
.tb-badges.is-stacked .tb-badge:first-child {
  margin-left: 0;
}
</style>
