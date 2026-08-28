<script setup lang="ts">
import { ref, useSlots, onBeforeUnmount } from 'vue'
import type { TooltipCellProps } from './types'

const props = withDefaults(defineProps<TooltipCellProps>(), {
  multiline: false,
})

const emit = defineEmits<{
  /** Popover became visible (after the hover delay) — for lazy content loading */
  open: []
}>()

const visible = ref(false)
const x = ref(0)
const y = ref(0)
let showTimer: ReturnType<typeof setTimeout> | null = null
const triggerRef = ref<HTMLElement | null>(null)
const popupRef = ref<HTMLElement | null>(null)
const slots = useSlots()

const PAD = 12

/** Position the popover at the cursor: below-right, clamped to the window bounds */
function positionAt(e: MouseEvent) {
  let left = e.clientX + PAD
  let top = e.clientY + PAD
  const el = popupRef.value
  if (el) {
    const rect = el.getBoundingClientRect()
    left = Math.min(left, window.innerWidth - rect.width - 8)
    top = Math.min(top, window.innerHeight - rect.height - 8)
  }
  x.value = Math.max(8, left)
  y.value = Math.max(8, top)
}

function onMouseEnter(e: MouseEvent) {
  positionAt(e)
  showTimer = setTimeout(() => {
    visible.value = true
    emit('open')
  }, 400)
}

function onMouseMove(e: MouseEvent) {
  if (!visible.value) return
  positionAt(e)
}

function onMouseLeave() {
  if (showTimer) clearTimeout(showTimer)
  visible.value = false
}

onBeforeUnmount(() => {
  if (showTimer) clearTimeout(showTimer)
})
</script>

<template>
  <span
    ref="triggerRef"
    class="tt-trigger"
    @mouseenter="onMouseEnter"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  >
    <slot />
    <Teleport to="body">
      <div
        v-if="visible && (text || slots.popup)"
        ref="popupRef"
        class="tt-popup"
        :class="{ 'tt-popup--multiline': multiline }"
        :style="{ left: x + 'px', top: y + 'px' }"
      >
        <slot name="popup">
          {{ text }}
        </slot>
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.tt-popup {
  position: fixed;
  background: #fff;
  color: #333;
  font-size: 12px;
  line-height: 1.45;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  white-space: nowrap;
  pointer-events: none;
  z-index: 9999;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.tt-popup--multiline {
  /* Stretch the backdrop to fit all content (nowrap lines must not overflow the edge) */
  width: max-content;
  max-width: none;
  white-space: normal;
}
</style>
