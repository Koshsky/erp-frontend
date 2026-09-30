<script setup lang="ts">
import { notifications, dismissNotification } from './state'
</script>

<template>
  <!-- Global floating error/success notifications (bottom-left corner, above
       the offline toast stack). Mounted once in App.vue. -->
  <div class="nhost" aria-live="polite">
    <TransitionGroup name="toast-fade">
      <div v-for="n in notifications" :key="n.id" class="nt" :class="`nt--${n.kind}`" role="alert">
        <button
          type="button"
          class="nt__close"
          aria-label="Закрыть"
          title="Закрыть"
          @click="dismissNotification(n.id)"
        >
          ×
        </button>
        <span class="nt__text">{{ n.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
@import '../styles/tokens.css';

.nhost {
  position: fixed;
  /* Bottom-left corner, above the offline toasts (reconnect = 20px,
     sync = 110px): app notifications get the topmost fixed slot. */
  bottom: 196px;
  left: 20px;
  z-index: 1002;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 90vw;
  pointer-events: none;
}

.nt {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 30px 10px 14px;
  border-radius: var(--ui-radius-sm);
  box-shadow: var(--ui-shadow-md);
  font-size: 14px;
  line-height: 1.45;
  min-width: min(320px, 90vw);
  max-width: min(420px, 90vw);
  white-space: pre-line;
  pointer-events: auto;
}

.nt--error {
  background: var(--ui-danger);
  color: var(--ui-accent-on);
}

.nt--success {
  background: var(--ui-success);
  color: var(--ui-accent-on);
}

.nt__close {
  position: absolute;
  top: 4px;
  right: 8px;
  background: transparent;
  border: none;
  color: color-mix(in srgb, var(--ui-accent-on) 85%, transparent);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.nt__close:hover {
  background: color-mix(in srgb, var(--ui-accent-on) 15%, transparent);
  color: var(--ui-accent-on);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>