<script setup lang="ts">
import { computed } from 'vue'
import { openHintPage, hintOpen, hintPageRef } from '@/composables/useHints'
import { hintPage } from '@/hints/registry'

const props = withDefaults(defineProps<{
  /** Hint page id from the central registry (src/hints/registry.ts). */
  hint: string
  /** Custom accessible name; defaults to the page title from the registry. */
  title?: string
  size?: 'sm' | 'md'
}>(), {
  title: undefined,
  size: 'sm',
})

const label = computed(() => props.title ?? hintPage(props.hint)?.title ?? props.hint)
/** Whether the side panel is open exactly with this hint page. */
const expanded = computed(() => hintOpen.value && hintPageRef.value === props.hint)
</script>

<template>
  <button
    type="button"
    class="hb"
    :class="`is-${size}`"
    :aria-label="`Подсказка: ${label}`"
    aria-haspopup="dialog"
    :aria-expanded="expanded"
    @click="openHintPage(hint)"
  >?</button>
</template>

<style scoped>
@import "../../../styles/tokens.css";
.hb {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--ui-accent);
  background: transparent;
  color: var(--ui-accent);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background var(--ui-duration), color var(--ui-duration);
}
.hb:hover {
  background: var(--ui-accent);
  color: var(--ui-accent-on);
}
.hb.is-sm {
  width: 20px;
  height: 20px;
  font-size: 12px;
}
</style>