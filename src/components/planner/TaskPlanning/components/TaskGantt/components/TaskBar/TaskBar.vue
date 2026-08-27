<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import LabeledBar from '../../../../../Bar/Bar.vue'
import { BarTooltip } from '@/components/common'
import { useDragPreview } from '@/composables/useDragPreview'
import type { Task } from './types'
import type { TimelineCtx } from '@/composables/timeline-context'
import type { DtoCommentResponse, DtoUserInfo } from '@/api'

const props = withDefaults(
  defineProps<{
    timeline: TimelineCtx
    task: Task
    projectCode?: string
    draggable?: boolean
    /** Границы процесса — ограничивают перетаскивание задачи */
    groupStartDate?: string | Date | number | null
    groupEndDate?: string | Date | number | null
    /** Справочник пользователей — имена авторов комментариев в тултипе */
    users?: DtoUserInfo[] | null
    /** Кэш комментариев по задаче (для лога в тултипе) */
    commentsByTask?: Record<number, DtoCommentResponse[]> | null
  }>(),
  {
    projectCode: '',
    draggable: true,
    groupStartDate: null,
    groupEndDate: null,
    users: null,
    commentsByTask: null,
  },
)

const emit = defineEmits<{
  change: [payload: { start_date: string; end_date: string }]
  contextmenu: [payload: { clientX: number; clientY: number }]
  /** Одиночный клик по бару (без перетаскивания) — открыть комментарии задачи */
  'open-comments': [payload: number]
  /** Тултип открылся у задачи с комментариями — лениво подгрузить их (кэш) */
  'request-comments': [payload: number]
}>()

/** Строки тултипа: ответственный (если назначен) + диапазон дат */
const tooltipRows = (dateRange: string): string[] =>
  [taskOwnerLabel.value, dateRange].filter(Boolean)

const taskOwnerLabel = computed<string>(() =>
  props.task.owner_name ? `Ответственный: ${props.task.owner_name}` : '',
)

/** У задачи есть комментарии — показываем бейдж и лог в тултипе */
const hasComments = computed(() => (props.task.comments_count ?? 0) > 0)

const userById = computed(() => new Map((props.users || []).map((u) => [u.id ?? 0, u])))

const fmtDT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function fmtShortDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : fmtDT.format(d)
}

/** Лог комментариев для тултипа: имя автора (из users), короткая дата, текст */
const tooltipComments = computed(() =>
  (props.commentsByTask?.[props.task.id] ?? []).map((c) => ({
    author:
      c.author_id != null
        ? userById.value.get(c.author_id)?.name ?? `Пользователь #${c.author_id}`
        : undefined,
    date: fmtShortDate(c.created_at),
    text: c.content ?? '',
  })),
)

/** Тултип открылся: если у задачи есть комментарии — лениво подгружаем их (кэш) */
function onTooltipOpen() {
  if (!hasComments.value) return
  emit('request-comments', props.task.id)
}

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

// === Бейджи: код проекта, ответственный + стопка бейджей ресурсов ===
// Бейдж кода проекта идёт сразу после названия; за ним — бейдж ответственного
// («Фамилия И.О.»). Если тот или другой не умещается рядом с названием — скрываются.
// Ресурсные бейджи при нехватке места складываются стопкой.
const contentRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const projRef = ref<HTMLElement | null>(null)
const ownerRef = ref<HTMLElement | null>(null)
const badgesRef = ref<HTMLElement | null>(null)
const projWidth = ref(0)
const ownerWidth = ref(0)
const showProj = ref(true)
const showOwner = ref(true)
const stacked = ref(false)

let resizeObserver: ResizeObserver | null = null

function updateStacked() {
  const content = contentRef.value
  const title = titleRef.value
  const badges = badgesRef.value
  if (!content || !title || !badges) return
  // Кэш ширины бейджей обновляем только пока они видимы (при display:none scrollWidth = 0)
  const proj = projRef.value
  if (proj && showProj.value) projWidth.value = proj.scrollWidth
  const owner = ownerRef.value
  if (owner && showOwner.value) ownerWidth.value = owner.scrollWidth
  const available = content.clientWidth - title.scrollWidth
  const pw = props.projectCode ? projWidth.value : 0
  showProj.value = pw > 0 && available >= pw
  const ow = props.task.owner_short ? ownerWidth.value : 0
  showOwner.value = ow > 0 && available - (showProj.value ? pw : 0) >= ow
  // Бейдж комментариев резервирует место (как код проекта/ответственный)
  const cw = hasComments.value ? 22 : 0
  const availForRes = available - (showProj.value ? pw : 0) - (showOwner.value ? ow : 0) - cw
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
watch(
  () => [props.task.owner_short, props.task.owner_name],
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
    @click="emit('open-comments', task.id)"
    @tooltip-open="onTooltipOpen"
  >
    <span ref="contentRef" class="tb-content">
      <span ref="titleRef" class="tb-title">{{ task.title }}</span>
      <span v-show="showProj" ref="projRef" class="tb-proj">{{ projectCode }}</span>
      <span v-show="showOwner" ref="ownerRef" class="tb-owner" :title="task.owner_name">{{ task.owner_short }}</span>
      <span ref="badgesRef" class="tb-badges" :class="{ 'is-stacked': stacked }">
        <span
          v-for="r in task.resources"
          :key="r.resource_id"
          class="tb-badge"
        >{{ badgeLabel(r) }}×{{ r.quantity }}</span>
      </span>
      <span v-if="hasComments" class="tb-comments" :title="`Комментарии: ${task.comments_count}`">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span>{{ task.comments_count }}</span>
      </span>
    </span>
    <template #tooltip="{ dateRange }">
      <BarTooltip
        :title="task.title"
        :accent="'#34a853'"
        :rows="tooltipRows(dateRange)"
        :resources="(task.resources || []).map((r) => ({ label: r.title || r.code, quantity: r.quantity }))"
        :comments="tooltipComments"
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
.tb-owner {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
  color: #fff;
  background: rgba(13, 102, 134, 0.85);
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
/* Бейдж комментариев: пузырь диалога + счётчик; не мешает перетаскиванию */
.tb-comments {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.6;
  color: #fff;
  background: rgba(0, 0, 0, 0.22);
  border-radius: 10px;
  padding: 0 7px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
