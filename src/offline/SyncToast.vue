<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { dismissSyncNotice, syncNotice, retryFailed, discardFailed } from './sync'

const visible = ref(false)
const busy = ref(false)
let timer: number | null = null

const failedItems = computed(() => syncNotice.value?.failedEntries ?? [])

watch(syncNotice, (n) => {
  if (!n) return
  visible.value = true
  if (timer != null) {
    window.clearTimeout(timer)
    timer = null
  }
  // Пока есть отвергнутые записи — тост висит: нужны действия пользователя.
  if (failedItems.value.length === 0) {
    timer = window.setTimeout(() => {
      visible.value = false
      dismissSyncNotice()
    }, 5000)
  }
})

onBeforeUnmount(() => {
  if (timer != null) window.clearTimeout(timer)
})

function shortUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin)
    return u.pathname + u.search
  } catch {
    return url
  }
}

async function onRetry() {
  if (busy.value) return
  busy.value = true
  try {
    await retryFailed()
  } finally {
    busy.value = false
  }
}

async function onDiscard() {
  if (busy.value) return
  busy.value = true
  try {
    await discardFailed()
    dismissSyncNotice()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <transition name="toast-fade">
    <div
      v-if="visible && syncNotice"
      class="sync-toast"
      :class="{ error: syncNotice.failed > 0 || syncNotice.interrupted }"
      role="status"
    >
      <template v-if="syncNotice.interrupted">
        Сеть снова пропала: отправлено {{ syncNotice.ok }}, остальное в очереди
      </template>
      <template v-else-if="failedItems.length > 0">
        <div class="sync-toast__head">
          Синхронизировано {{ syncNotice.ok }}, ошибок {{ failedItems.length }}
        </div>
        <ul class="sync-toast__list">
          <li v-for="(it, i) in failedItems.slice(0, 5)" :key="i" class="sync-toast__item">
            <span class="sync-toast__req">{{ it.method }} {{ shortUrl(it.url) }}</span>
            <span class="sync-toast__msg">{{ it.message }}</span>
          </li>
        </ul>
        <div class="sync-toast__actions">
          <button type="button" class="sync-btn" :disabled="busy" @click="onRetry">Повторить</button>
          <button type="button" class="sync-btn sync-btn--ghost" :disabled="busy" @click="onDiscard">
            Пропустить
          </button>
        </div>
      </template>
      <template v-else>Синхронизировано изменений: {{ syncNotice.ok }}</template>
    </div>
  </transition>
</template>

<style scoped>
.sync-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1001;
  background: #16a34a;
  color: #fff;
  padding: 10px 18px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.2);
  font-size: 14px;
  max-width: 90vw;
  min-width: 300px;
  text-align: center;
}

.sync-toast.error {
  background: #b91c1c;
}

.sync-toast__head {
  font-weight: 600;
  margin-bottom: 6px;
}

.sync-toast__list {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sync-toast__item {
  background: rgb(0 0 0 / 0.18);
  border-radius: 6px;
  padding: 5px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.sync-toast__req {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  opacity: 0.9;
  word-break: break-all;
}

.sync-toast__msg {
  opacity: 0.8;
}

.sync-toast__actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.sync-btn {
  background: #fff;
  color: #b91c1c;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.sync-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.sync-btn--ghost {
  background: transparent;
  color: #fff;
  border: 1px solid rgb(255 255 255 / 0.6);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
</style>
