<script setup lang="ts">
import { ref, useSlots, onBeforeUnmount } from 'vue'
import type { TooltipCellProps } from './types'

const props = withDefaults(defineProps<TooltipCellProps>(), {
  multiline: false,
})

const visible = ref(false)
const x = ref(0)
const y = ref(0)
let showTimer: ReturnType<typeof setTimeout> | null = null
const triggerRef = ref<HTMLElement | null>(null)
const slots = useSlots()

function getPos(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return { x: rect.right + 8, y: rect.top + rect.height / 2 }
}

function onMouseEnter(e: MouseEvent) {
  const pos = getPos(e.currentTarget as HTMLElement)
  x.value = pos.x
  y.value = pos.y
  showTimer = setTimeout(() => { visible.value = true }, 400)
}

function onMouseMove(e: MouseEvent) {
  if (!visible.value) return
  const pos = getPos(e.currentTarget as HTMLElement)
  x.value = pos.x
  y.value = pos.y
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
.tt-trigger {
  display: inline;
  cursor: default;
}
.tt-popup {
  position: fixed;
  transform: translateY(-50%);
  background: #2c2c2c;
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
  padding: 6px 14px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 9999;
  box-shadow: 0 3px 12px rgba(0,0,0,.3);
}
.tt-popup--multiline {
  white-space: normal;
  max-width: 300px;
}
</style>
