<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
import type { PlanningUnit } from '../calendar'
import { fmtDate, toDate } from '../calendar'
import { useInfiniteTimeline } from '../../../composables/useInfiniteTimeline'
import {
  INTERACTIVE_SELECTOR,
  TimelineScrollKey,
  TimelineSyncKey,
  type TimelineCtx,
} from '../../../composables/timeline-context'
import { useTimelinePan } from '../../../composables/useTimelinePan'
import TodayLine from '../TodayLine/TodayLine.vue'
import ScaleBadge from '../ScaleBadge/ScaleBadge.vue'

const props = defineProps<{
  /** Дата-якорь: ячейка с индексом 0 (начальная позиция шкалы) */
  origin: Date | string
  /** Единица ячейки: день или декада */
  unit: PlanningUnit
  /** Стабильный id таблицы: масштаб и прокрутка сохраняются между переключениями вкладок */
  id?: string
  /** При открытии/изменении прокрутить шкалу так, чтобы эта дата была у левого края */
  focusDate?: string | null
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
const contentEl = ref<HTMLElement | null>(null)
const unit = computed(() => props.unit)

/** Дата-якорь; при пустом origin — сегодня */
const originDate = props.origin ? toDate(props.origin) : new Date()

const tl = useInfiniteTimeline(originDate, unit, scrollEl, contentEl, props.id)

provide(TimelineScrollKey, scrollEl)
provide(TimelineSyncKey, tl.sync)

onMounted(async () => {
  tl.mount()
  pan.enable()
  // Якорь (навигация с другой вкладки): прокручиваем после того, как mount
  // восстановил сохранённую позицию, чтобы якорь её перекрыл.
  if (props.focusDate) {
    await nextTick()
    tl.scrollToDate(props.focusDate)
  }
})

/** Изменение якоря без перемонтирования (смена query на той же странице) */
watch(
  () => props.focusDate,
  (d) => {
    if (d && scrollEl.value) void nextTick(() => tl.scrollToDate(d))
  },
)

onBeforeUnmount(() => {
  pan.disable()
  tl.unmount()
})

/**
 * Элементы, с которых нельзя начать панорамирование: на них висит свой интерактив
 * (бары, вехи, реордер строк, липкие колонки, ресурсная лента). Шапку .tg-head
 * тянуть можно — это «пустое место» шкалы. Полоса вех .tg-ms-label тоже не тянется.
 */
const PAN_IGNORE = INTERACTIVE_SELECTOR + ', .tg-ms-label'

const pan = useTimelinePan(scrollEl, PAN_IGNORE)

/** Контекст таймлайна для слотов: ref-ы развёрнуты; Date не кладём (Proxy ломается) */
const ctx: TimelineCtx = reactive({
  origin: fmtDate(originDate),
  unit,
  cellPx: tl.cellPx,
  scale: tl.tableScale,
  scaleBump: tl.scaleBump,
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
  if (target.closest(INTERACTIVE_SELECTOR + ', .tg-head')) {
    return
  }
  const date = tl.dateAtPointer(scrollEl.value?.getBoundingClientRect() ?? null, e.clientX)
  const rowEl = target.closest<HTMLElement>('.gg-row')
  const groupEl = target.closest<HTMLElement>('.gg-group')
  // Полоса вех (.tg-task-group) лежит рядом с .gg-group, а не внутри неё, но это та же
  // группа процесса — резолвим её через вложенный .gg-group (вставка в конец, как у пустого места).
  const tgGroupEl = target.closest<HTMLElement>('.tg-task-group')
  const msGroupEl = !rowEl && !groupEl && tgGroupEl
    ? tgGroupEl.querySelector<HTMLElement>('.gg-group')
    : null
  const rowIndex = rowEl
    ? Number(rowEl.dataset.rowIndex)
    : groupEl
      ? Number(groupEl.dataset.rows ?? 0)
      : msGroupEl
        ? Number(msGroupEl.dataset.rows ?? 0)
        : undefined
  const groupId = (groupEl ?? msGroupEl)?.dataset.group ?? undefined
  emit('ctxmenu', { clientX: e.clientX, clientY: e.clientY, date, rowIndex, groupId })
}
</script>

<template>
  <div ref="scrollEl" class="tg-scroll" @contextmenu.prevent="onContextMenu">
    <div ref="contentEl" class="tg-content" :style="{ width: ctx.contentWidth + 'px' }">
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

      <!-- Красный луч текущей даты: граница между «вчера» и «сегодня» -->
      <TodayLine :timeline="ctx" />

      <slot :t="ctx" />
    </div>

    <!-- Бейдж масштаба: всплывает при зумме Ctrl+колесо -->
    <ScaleBadge :scale="ctx.scale" :bump="ctx.scaleBump" />
  </div>
</template>

<style scoped>
.tg-scroll {
  overflow: auto;
  max-height: var(--planner-max-height, calc(100vh - 160px));
}
.tg-scroll :deep(.gg-bars) {
  cursor: grab;
}
.tg-scroll.tg-panning,
.tg-scroll.tg-panning :deep(.gg-bars) {
  cursor: grabbing;
}
.tg-scroll.tg-panning :deep(*) {
  user-select: none;
  -webkit-user-select: none;
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
