<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { dismissSyncNotice, syncNotice } from './sync'

const visible = ref(false)
let timer: number | null = null

watch(syncNotice, (n) => {
  if (!n) return
  visible.value = true
  if (timer != null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    visible.value = false
    dismissSyncNotice()
  }, 5000)
})

onBeforeUnmount(() => {
  if (timer != null) window.clearTimeout(timer)
})
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
      <template v-else-if="syncNotice.failed > 0">
        Синхронизировано {{ syncNotice.ok }}, ошибок {{ syncNotice.failed }} — данные обновлены с сервера
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
  text-align: center;
}

.sync-toast.error {
  background: #dc2626;
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
