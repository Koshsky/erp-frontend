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
  /** При открытии/изменении прокрутить контейнер по вертикали к группе с этим id */
  focusGroupId?: string | number | null
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
  /** ПКМ по шапке таблицы (календарный заголовок / корнер): переключение масштаба */
  'header-ctxmenu': [payload: { clientX: number; clientY: number }]
  /**
   * Текущее видимое окно шкалы (период «как на экране») + эффективная ширина
   * ячейки с учётом зума + масштаб зума (Ctrl+wheel). Дебаунс ~150 мс; испускается
   * при прокрутке/зуме/смене масштаба и после монтирования. Потребитель — печать в PDF.
   */
  'visible-range': [payload: { from: string; to: string; cellWidthPx: number; scale: number }]
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
  if (props.focusDate || props.focusGroupId != null) {
    await nextTick()
    applyFocus()
  }
  emitVisibleRange()
})

/** Видимое окно шкалы для потребителей (печать): первая/последняя видимая дата + ширина ячейки */
function emitVisibleRange() {
  const start = tl.windowStart.value
  const count = tl.viewportCells.value
  if (count <= 0) return
  const from = fmtDate(tl.cellStart(start))
  const to = fmtDate(tl.cellEnd(start + count - 1))
  const cellWidthPx = Math.round(tl.cellPx.value * tl.tableScale.value * 100) / 100
  emit('visible-range', { from, to, cellWidthPx, scale: tl.tableScale.value })
}

let rangeTimer: ReturnType<typeof setTimeout> | null = null
function scheduleVisibleRange() {
  if (rangeTimer != null) clearTimeout(rangeTimer)
  rangeTimer = setTimeout(() => {
    rangeTimer = null
    emitVisibleRange()
  }, 150)
}

watch(
  [
    () => tl.windowStart.value,
    () => tl.viewportCells.value,
    () => tl.cellPx.value,
    () => tl.tableScale.value,
    () => unit.value,
  ],
  scheduleVisibleRange,
)

/** Изменение якоря без перемонтирования (смена query на той же странице) */
watch(
  () => [props.focusDate, props.focusGroupId] as const,
  () => {
    if ((props.focusDate || props.focusGroupId != null) && scrollEl.value) {
      void nextTick(applyFocus)
    }
  },
)

/**
 * Смена масштаба «День»/«Декада»: центром сжатия/растяжения остаётся центр таблицы,
 * а не левый край. Ловим точную дату в центре окна по старому масштабу (layout от
 * unit не зависит), затем прокручиваем так, чтобы эта дата снова оказалась в центре.
 */
watch(
  () => props.unit,
  async (newUnit, oldUnit) => {
    const sc = scrollEl.value
    if (!sc || newUnit === oldUnit) return
    const centerDate = tl.dateAtLocalX(sc.clientWidth / 2, oldUnit)
    await nextTick()
    if (centerDate) tl.scrollToCenterDate(centerDate)
  },
)

/**
 * Прокрутка к якорю: по дате — целевая ячейка у левого края; по группе —
 * строка .gg-group с этим id становится сразу под липкими шапками.
 */
function applyFocus() {
  if (props.focusDate) tl.scrollToDate(props.focusDate)
  if (props.focusGroupId != null) focusGroup(props.focusGroupId, 0, 0)
}

/**
 * Вертикальная прокрутка к группе: группы рендерятся слотом после монтирования,
 * а их позиция может меняться (дозагрузка данных/ресурсной ленты). Ретраим по
 * кадрам, пока цель не встанет под липкие шапки и не «успокоится» на пару кадров.
 */
function focusGroup(groupId: string | number, attempt: number, settled: number) {
  const sc = scrollEl.value
  if (!sc || attempt > 120) return
  const target = sc.querySelector<HTMLElement>(`.gg-group[data-group="${groupId}"]`)
  if (!target) {
    requestAnimationFrame(() => focusGroup(groupId, attempt + 1, 0))
    return
  }
  const delta = scrollGroupToTop(target)
  const nextSettled = Math.abs(delta) < 2 ? settled + 1 : 0
  if (nextSettled >= 3) return
  requestAnimationFrame(() => focusGroup(groupId, attempt + 1, nextSettled))
}

/** Вертикальная прокрутка: верх группы — под липкими шапками; возвращает смещение */
function scrollGroupToTop(target: HTMLElement): number {
  const sc = scrollEl.value
  if (!sc) return 0
  const scRect = sc.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const headH = sc.querySelector<HTMLElement>('.tg-head')?.offsetHeight ?? 0
  const rsH = sc.querySelector<HTMLElement>('.rs-block')?.offsetHeight ?? 0
  const delta = targetRect.top - scRect.top - headH - rsH
  sc.scrollTop += delta
  return delta
}

onBeforeUnmount(() => {
  if (rangeTimer != null) clearTimeout(rangeTimer)
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

/** ПКМ по пустому месту шкалы (бары/лейблы/вехи перехватывают сами через .stop).
 *  ПКМ по шапке таблицы — меню переключения масштаба (день/декада). */
function onContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.tg-head, .th-corner')) {
    emit('header-ctxmenu', { clientX: e.clientX, clientY: e.clientY })
    return
  }
  if (target.closest(INTERACTIVE_SELECTOR)) {
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
