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
    /** Custom task color (#RRGGBB); empty — the standard token */
    color?: string
    draggable?: boolean
    /** Vertical row reorder: pressing the bar body and dragging vertically calls
     *  this with the pointerdown event (horizontal drags keep changing dates). */
    startRowReorder?: ((e: PointerEvent) => void) | null
    /** Process bounds — limit task dragging */
    groupStartDate?: string | Date | number | null
    groupEndDate?: string | Date | number | null
    /** User directory — author names for comments in the tooltip */
    users?: DtoUserInfo[] | null
    /** Per-task comments cache (for the log in the tooltip) */
    commentsByTask?: Record<number, DtoCommentResponse[]> | null
  }>(),
  {
    projectCode: '',
    color: '',
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
  /** Single click on the bar (without dragging) — open the task editor */
  'edit': [payload: number]
  /** Tooltip opened on a task with comments — lazy-load them (cache) */
  'request-comments': [payload: number]
  /** Click on the comments badge (bubble + counter) - open the comments panel */
  'open-comments': [payload: number]
}>()

/** Tooltip rows: owner (if assigned) + date range */
const tooltipRows = (dateRange: string): string[] =>
  [taskOwnerLabel.value, dateRange].filter(Boolean)

const taskOwnerLabel = computed<string>(() =>
  props.task.owner_name ? `Ответственный: ${props.task.owner_name}` : '',
)

/** The task has comments — show a badge and the log in the tooltip */
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

/** Comment log for the tooltip: author name (from users), short date, text */
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

/** Tooltip opened: if the task has comments — lazy-load them (cache) */
function onTooltipOpen() {
  if (!hasComments.value) return
  emit('request-comments', props.task.id)
}

/** Live loading preview: publish the dragged task and its new dates */
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

/** Resource badge label: the code, or the full name if absent */
function badgeLabel(r: { code?: string; title?: string }): string {
  return r.code || r.title || '?'
}

// === Badges: project code, owner + a stack of resource badges ===
// The project code badge goes right after the title; after it — the owner badge
// ("Last Name I.O."). If either does not fit next to the title — it is hidden.
// Resource badges stack up when space is tight.
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
  // Refresh the badge width cache only while they are visible (with display:none scrollWidth = 0)
  const proj = projRef.value
  if (proj && showProj.value) projWidth.value = proj.scrollWidth
  const owner = ownerRef.value
  if (owner && showOwner.value) ownerWidth.value = owner.scrollWidth
  const available = content.clientWidth - title.scrollWidth
  const pw = props.projectCode ? projWidth.value : 0
  showProj.value = pw > 0 && available >= pw
  const ow = props.task.owner_short ? ownerWidth.value : 0
  showOwner.value = ow > 0 && available - (showProj.value ? pw : 0) >= ow
  // The comments badge reserves space (like the project code/owner)
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

// After the resource set or the project code changes, recompute the layout
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
    :color="color || task.color || 'var(--ui-gantt-task)'"
    :draggable="draggable"
    :start-row-reorder="startRowReorder"
    @change="(d) => emit('change', d)"
    @contextmenu="(p) => emit('contextmenu', p)"
    @dragstart="(d) => setDragPreview(d)"
    @dragmove="(d) => setDragPreview(d)"
    @dragend="() => setDragPreview(null)"
    @click="emit('edit', task.id)"
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
          :style="r.color ? { background: r.color } : undefined"
        >{{ badgeLabel(r) }}×{{ r.quantity }}</span>
      </span>
      <span v-if="hasComments" class="tb-comments" :title="`Комментарии: ${task.comments_count}`" @pointerdown.stop @click.stop="emit('open-comments', task.id)">
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
        :accent="color || task.color || 'var(--ui-gantt-task)'"
        :rows="tooltipRows(dateRange)"
        :resources="(task.resources || []).map((r) => ({ label: r.title || r.code, quantity: r.quantity, color: r.color }))"
        :comments="tooltipComments"
      />
    </template>
  </LabeledBar>
</template>

<style scoped>
@import "../../../../../../../styles/tokens.css";
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
  color: var(--ui-accent-on);
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
/* Badge — a plain flex item, sized exactly to the text; 6px gap between badges */
.tb-badge {
  flex-shrink: 0;
  width: fit-content;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.6;
  color: #fff;
  background: var(--ui-danger);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 10px;
  padding: 0 7px;
  white-space: nowrap;
  pointer-events: none;
}
/* Badges do not fit side by side — stack them: each next one
   overlaps the previous; hovering the bar shows a tooltip with all resources */
.tb-badges .tb-badge:first-child {
  margin-left: 0;
}
.tb-badges.is-stacked .tb-badge {
  margin-left: -7px;
}
.tb-badges.is-stacked .tb-badge:first-child {
  margin-left: 0;
}
/* Comments badge: dialog bubble + counter; a click opens the comments panel */
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
  cursor: pointer;
}
/* Hover over the comments badge: highlight so it reads as clickable */
.tb-comments:hover {
  background: var(--ui-accent);
}
</style>
