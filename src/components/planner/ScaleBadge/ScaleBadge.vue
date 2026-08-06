<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { ScaleBadgeProps } from './types'

const props = defineProps<ScaleBadgeProps>()

const show = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

/** Каждый зум перезапускает таймер скрытия — бейдж виден, пока зумишь */
watch(
  () => props.bump,
  () => {
    show.value = true
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      show.value = false
    }, 900)
  },
)

onBeforeUnmount(() => {
  if (hideTimer) clearTimeout(hideTimer)
})
</script>

<template>
  <Transition name="sb-fade">
    <div v-if="show" class="sb">
      <span class="sb-label">Масштаб </span>
      <span class="sb-value">{{ Math.round(scale * 100) }}%</span>
    </div>
  </Transition>
</template>

<style scoped>
.sb {
  position: sticky;
  bottom: 12px;
  left: 100%;
  transform: translateX(calc(-100% - 12px));
  z-index: 50;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(32, 33, 36, 0.88);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
.sb-label {
  opacity: 0.75;
  font-weight: 400;
}
.sb-value {
  min-width: 38px;
  text-align: right;
}
.sb-fade-enter-active,
.sb-fade-leave-active {
  transition: opacity 0.25s ease;
}
.sb-fade-enter-from,
.sb-fade-leave-to {
  opacity: 0;
}
</style>
