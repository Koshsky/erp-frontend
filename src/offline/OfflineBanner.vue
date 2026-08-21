<script setup lang="ts">
import { isOffline } from './state'
import { pendingCount } from './outbox'
</script>

<template>
  <transition name="offline-fade">
    <div v-if="isOffline" class="offline-banner" role="status">
      <span>Бэкенд недоступен: показаны сохранённые данные, изменения копятся в очереди</span>
      <span v-if="pendingCount > 0" class="offline-banner__count">
        {{ pendingCount }} ожид. синхронизации
      </span>
      <span class="offline-banner__hint">
        Нет данных в разделе? Откройте его онлайн хотя бы раз.
      </span>
    </div>
  </transition>
</template>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 8px 16px;
  background: #f39c12;
  color: #fff;
  font-size: 14px;
  text-align: center;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
}

.offline-banner__count {
  background: rgb(0 0 0 / 0.25);
  padding: 2px 10px;
  border-radius: 999px;
  font-weight: 600;
  white-space: nowrap;
}

.offline-banner__hint {
  opacity: 0.85;
  font-size: 12px;
}

.offline-fade-enter-active,
.offline-fade-leave-active {
  transition: opacity 0.2s ease;
}

.offline-fade-enter-from,
.offline-fade-leave-to {
  opacity: 0;
}
</style>
