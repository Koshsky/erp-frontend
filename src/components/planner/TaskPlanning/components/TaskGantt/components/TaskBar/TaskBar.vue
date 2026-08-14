<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import LabeledBar from '../../../../../Bar/Bar.vue'
import { BarTooltip } from '@/components/common'
import { useDragPreview } from '@/composables/useDragPreview'
import type { Task } from './types'
import type { TimelineCtx } from '@/composables/timeline-context'

const props = withDefaults(
  defineProps<{
    timeline: TimelineCtx
    task: Task
    projectCode?: string
    draggable?: boolean
    /** Границы процесса — ограничивают перетаскивание задачи */
    groupStartDate?: string | Date | number | null
    groupEndDate?: string | Date | number | null
  }>(),
  {
    projectCode: '',
    draggable: true,
    groupStartDate: null,
    groupEndDate: null,
  },
)

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
}>()

/** Live-предпросмотр загрузки: публикуем перетаскиваемую задачу и её новые даты */
const dragPreview = useDragPreview()

function setDragPreview(d: { start_date: string; end_date: string } | null) {
  if (!dragPreview) return
  if (!d) {
    dragPreview.value.active = false
    return
  }
  if (!props.task.resources?.length) return
  dragPreview.value = {
    active: true,
    taskId: props.task.id,
    startDate: d.start_date,
    endDate: d.end_date,
  }
}

/** Название ресурса для бейджа: код, при его отсутствии — полное название */
function badgeLabel(r: { code?: string; title?: string }): string {
  return r.code || r.title || '?'
}

// === Бейдж кода проекта + стопка бейджей ресурсов ===
// Бейдж кода проекта идёт сразу после названия; если не умещается рядом с полным
// названием — скрывается. Ресурсные бейджи при нехватке места складываются стопкой.
const contentRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const projRef = ref<HTMLElement | null>(null)
const badgesRef = ref<HTMLElement | null>(null)
const projWidth = ref(0)
const showProj = ref(true)
const stacked = ref(false)

let resizeObserver: ResizeObserver | null = null

function updateStacked() {
  const content = contentRef.value
  const title = titleRef.value
  const badges = badgesRef.value
  if (!content || !title || !badges) return
  // Кэш ширины бейджа проекта обновляем только пока он видим (при display:none scrollWidth = 0)
  const proj = projRef.value
  if (proj && showProj.value) projWidth.value = proj.scrollWidth
  const available = content.clientWidth - title.scrollWidth
  const pw = props.projectCode ? projWidth.value : 0
  showProj.value = pw > 0 && available >= pw
  const availForRes = available - (showProj.value ? pw : 0)
  stacked.value = badges.scrollWidth > availForRes
}

onMounted(() => {
  updateStacked()
  resizeObserver = new ResizeObserver(updateStacked)
  if (contentRef.value) resizeObserver.observe(contentRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

// После обновления набора ресурсов или кода проекта пересчитываем укладку
watch(
  () => props.task.resources,
  () => requestAnimationFrame(updateStacked),
)
watch(
  () => props.projectCode,
  () => requestAnimationFrame(updateStacked),
)
</script>

<template>
  <LabeledBar
    :timeline="timeline"
    :startDate="task.start_date"
    :endDate="task.end_date"
    :groupStartDate="groupStartDate"
    :groupEndDate="groupEndDate"
    :title="task.title"
    :draggable="draggable"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @dragstart="(d) => setDragPreview(d)"
    @dragmove="(d) => setDragPreview(d)"
    @dragend="() => setDragPreview(null)"
  >
    <span ref="contentRef" class="tb-content">
      <span ref="titleRef" class="tb-title">{{ task.title }}</span>
      <span v-show="showProj" ref="projRef" class="tb-proj">{{ projectCode }}</span>
      <span ref="badgesRef" class="tb-badges" :class="{ 'is-stacked': stacked }">
        <span
          v-for="r in task.resources"
          :key="r.resource_id"
          class="tb-badge"
        >{{ badgeLabel(r) }}×{{ r.quantity }}</span>
      </span>
    </span>
    <template #tooltip="{ dateRange }">
      <BarTooltip
        :title="task.title"
        :accent="'#34a853'"
        :rows="[dateRange]"
        :resources="(task.resources || []).map((r) => ({ label: r.title || r.code, quantity: r.quantity }))"
      />
    </template>
  </LabeledBar>
</template>

<style scoped>
.tb-content {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.tb-title {
  flex: 0 1 auto;
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
.tb-proj {
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
.tb-badges {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
}
/* Бейдж — прямой flex-элемент, размер строго по тексту; зазор между бейджами 6px */
.tb-badge {
  flex-shrink: 0;
  width: fit-content;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.6;
  color: #fff;
  background: #d93025;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 10px;
  padding: 0 7px;
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
