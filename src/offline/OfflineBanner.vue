<script setup lang="ts">
import { isOffline } from './state'
</script>

<template>
  <transition name="offline-fade">
    <div v-if="isOffline" class="offline-banner" role="status">
      Офлайн-режим: показаны сохранённые данные, изменения не сохраняются
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
