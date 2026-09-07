<script setup lang="ts">
import { computed, ref } from 'vue'
import { isOffline, reconnectCountdown } from './state'
import { retryConnectionNow } from './connection'

const busy = ref(false)

/** Whether the reconnect countdown is active (a next attempt is scheduled). */
const counting = computed(() => reconnectCountdown.value != null)

/** Seconds until the next automatic reconnect attempt (null → probing now). */
function secondsLeft(): number | null {
  const left = reconnectCountdown.value
  if (left == null) return null
  return Math.max(0, Math.ceil(left))
}

async function onRetry() {
  if (busy.value) return
  busy.value = true
  try {
    await retryConnectionNow()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <transition name="reconnect-fade">
    <div v-if="isOffline" class="reconnect-toast" role="status">
      <div class="reconnect-toast__title">Нет соединения с сервером</div>
      <div class="reconnect-toast__body">
        <span v-if="counting" class="reconnect-toast__countdown">
          Попытка реконнекта через {{ secondsLeft() }} с
        </span>
        <button
          type="button"
          class="reconnect-toast__retry"
          :disabled="busy"
          @click="onRetry"
        >
          {{ busy ? 'Проверяю…' : 'Повторить' }}
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.reconnect-toast {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 1100;
  min-width: 280px;
  max-width: min(360px, calc(100vw - 40px));
  padding: 12px 14px;
  border-radius: 12px;
  background: #2C313A; /* Telegram-like dark surface, same in both themes */
  color: #E5E7EB;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  font-size: 13px;
  line-height: 1.35;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reconnect-toast__title {
  font-weight: 600;
  color: #FFFFFF;
}

.reconnect-toast__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.reconnect-toast__countdown {
  color: rgba(229, 231, 235, 0.85);
  font-size: 12px;
}

.reconnect-toast__retry {
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  background: #4C80F0; /* Telegram blue action */
  color: #FFFFFF;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;
}

.reconnect-toast__retry:hover:not(:disabled) {
  background: #3B6FE0;
}

.reconnect-toast__retry:disabled {
  opacity: 0.7;
  cursor: default;
}

.reconnect-fade-enter-active,
.reconnect-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.reconnect-fade-enter-from,
.reconnect-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>