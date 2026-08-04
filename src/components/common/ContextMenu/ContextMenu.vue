<script setup lang="ts">
import { ref, watch, onBeforeUnmount, onMounted } from 'vue'
import type { ContextMenuProps } from './types'

const props = defineProps<ContextMenuProps>()

const emit = defineEmits<{
  select: [id: string]
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)

function clampPos(): { x: number; y: number } {
  const el = menuRef.value
  if (!el) return { x: props.x, y: props.y }
  const { innerWidth, innerHeight } = window
  const rect = el.getBoundingClientRect()
  const x = Math.min(props.x, innerWidth - rect.width - 8)
  const y = Math.min(props.y, innerHeight - rect.height - 8)
  return { x: Math.max(8, x), y: Math.max(8, y) }
}

const style = ref<Record<string, string>>({})

watch(
  () => [props.open, props.x, props.y] as const,
  () => {
    if (!props.open) return
    style.value = {
      position: 'fixed',
      left: '0px',
      top: '0px',
      visibility: 'hidden',
    }
    requestAnimationFrame(() => {
      const p = clampPos()
      style.value = { position: 'fixed', left: p.x + 'px', top: p.y + 'px' }
    })
  },
  { immediate: true },
)

function onDocClick(e: MouseEvent) {
  if (!props.open) return
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) emit('close')
}

function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function onDocScroll() {
  if (props.open) emit('close')
}

function onSelect(id: string) {
  emit('select', id)
  emit('close')
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKey)
  document.addEventListener('scroll', onDocScroll, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKey)
  document.removeEventListener('scroll', onDocScroll, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuRef"
      class="cm"
      :style="style"
      role="menu"
      @contextmenu.prevent
    >
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="cm-item"
        role="menuitem"
        @click="onSelect(item.id)"
      >
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.cm {
  z-index: 10000;
  min-width: 180px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px;
}
.cm-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 12px;
  font-size: 13px;
  color: #333;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.cm-item:hover {
  background: #e6faf7;
  color: #00b3a6;
}
</style>
