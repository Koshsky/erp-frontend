<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref } from 'vue'
import type { PlanningUnit } from '../calendar'
import { fmtDate, toDate } from '../calendar'
import {
  useInfiniteTimeline,
  TimelineScrollKey,
  TimelineSyncKey,
  type TimelineCtx,
} from '../../../composables/useInfiniteTimeline'

const props = defineProps<{
  /** Дата-якорь: ячейка с индексом 0 (начальная позиция шкалы) */
  origin: Date | string
  /** Единица ячейки: день или декада */
  unit: PlanningUnit
}>()

const emit = defineEmits<{
  /** ПКМ по пустому месту шкалы (не по барам/лейблам): дата, строка и группа под курсором */
  ctxmenu: [payload: {
    clientX: number
    clientY: number
    date: string | null
    rowIndex?: number
    groupId?: string
  }]
}>()

const scrollEl = ref<HTMLElement | null>(null)
const unit = computed(() => props.unit)

/** Дата-якорь; при пустом origin — сегодня */
const originDate = props.origin ? toDate(props.origin) : new Date()

const tl = useInfiniteTimeline(originDate, unit, scrollEl)

provide(TimelineScrollKey, scrollEl)
provide(TimelineSyncKey, tl.sync)

onMounted(() => tl.mount())
onBeforeUnmount(() => tl.unmount())

/** Контекст таймлайна для слотов: ref-ы развёрнуты; Date не кладём (Proxy ломается) */
const ctx: TimelineCtx = reactive({
  origin: fmtDate(originDate),
  unit,
  cellPx: tl.cellPx,
  windowStart: tl.windowStart,
  viewportCells: tl.viewportCells,
  leftPad: tl.leftPad,
  contentWidth: tl.contentWidth,
  gridLeft: tl.gridLeft,
  visibleIndices: tl.visibleIndices,
  cellLeft: tl.cellLeft,
  cellStart: tl.cellStart,
  cellEnd: tl.cellEnd,
  dateAtPointer: tl.dateAtPointer,
})

/** ПКМ по пустому месту шкалы (бары/лейблы/вехи перехватывают сами через .stop) */
function onContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.gantt-bar, .gb-handle, .ms, .row-handle, .gg-label, .gg-merged, .th-corner, .rs-label, .tg-head')) {
    return
  }
  const date = tl.dateAtPointer(scrollEl.value?.getBoundingClientRect() ?? null, e.clientX)
  const rowEl = target.closest<HTMLElement>('.gg-row')
  const groupEl = target.closest<HTMLElement>('.gg-group')
  const rowIndex = rowEl
    ? Number(rowEl.dataset.rowIndex)
    : groupEl
      ? Number(groupEl.dataset.rows ?? 0)
      : undefined
  const groupId = groupEl?.dataset.group ?? undefined
  emit('ctxmenu', { clientX: e.clientX, clientY: e.clientY, date, rowIndex, groupId })
}
</script>

<template>
  <div ref="scrollEl" class="tg-scroll" @contextmenu.prevent="onContextMenu">
    <div class="tg-content" :style="{ width: ctx.contentWidth + 'px' }">
      <!-- Сеточные линии только для видимого окна (под контентом) -->
      <div
        class="tg-gridlines"
        :style="{ left: ctx.gridLeft + 'px', width: (ctx.viewportCells + 1) * ctx.cellPx + 'px' }"
      >
        <div
          v-for="k in ctx.viewportCells + 1"
          :key="'gl' + k"
          class="tg-line"
          :style="{ left: (k - 1) * ctx.cellPx + 'px' }"
        />
      </div>

      <slot :t="ctx" />
    </div>
  </div>
</template>

<style scoped>
.tg-scroll {
  overflow: auto;
  max-height: var(--planner-max-height, calc(100vh - 160px));
}
.tg-content {
  position: relative;
  min-height: 100%;
}
.tg-gridlines {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  pointer-events: none;
}
.tg-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #e4e6e8;
}
</style>
