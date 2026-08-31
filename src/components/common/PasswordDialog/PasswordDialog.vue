<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CopyField from '../CopyField/CopyField.vue'
import type { PasswordDialogProps } from './types'

const props = withDefaults(defineProps<PasswordDialogProps>(), {
  open: false,
})

const emit = defineEmits<{
  close: []
}>()

const cardRef = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLButtonElement | null>(null)

// Move focus into the dialog when it opens so keyboard/screen-reader flow
// follows the modal instead of staying on the background page.
watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick()
      closeBtn.value?.focus()
    }
  },
)

// Trap Tab inside the dialog: cycle between the first and the last focusable
// element (the copy button of CopyField and the close button); a disabled
// copy button (empty password) is skipped by the filter.
function onTab(e: KeyboardEvent) {
  const el = cardRef.value
  if (!el) return
  const focusables = Array.from(
    el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).filter((n) => !(n as HTMLButtonElement).disabled)
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement
  if (e.shiftKey && (active === first || !el.contains(active))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || !el.contains(active))) {
    e.preventDefault()
    first.focus()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pd-overlay" @mousedown.self="emit('close')">
      <div ref="cardRef" class="pd-card" role="dialog" aria-modal="true" :aria-label="caption" @keydown.tab="onTab">
        <div class="pd-caption">{{ caption }}</div>
        <CopyField :value="password" />
        <p class="pd-note">Пароль показывается один раз. Скопируйте его и передайте пользователю.</p>
        <button ref="closeBtn" type="button" class="pd-close" @click="emit('close')">Закрыть</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import '../../../styles/tokens.css';

/* Overlays sit above the app header (z 30000), like the other modals */
.pd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 40000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pd-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  padding: 24px;
  width: 420px;
  max-width: calc(100vw - 32px);
  box-shadow: var(--ui-shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pd-caption {
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
}
.pd-note {
  font-size: 12px;
  color: var(--ui-text-muted);
  margin: 0;
}
.pd-close {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
}
.pd-close:hover {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
</style>