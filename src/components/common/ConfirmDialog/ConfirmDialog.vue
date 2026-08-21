<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import type { ConfirmDialogProps } from './types'

withDefaults(defineProps<ConfirmDialogProps>(), {
  title: 'Подтверждение',
  confirmLabel: 'Удалить',
  danger: true,
})

const emit = defineEmits<{
  confirm: []
  close: []
}>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="cd-overlay" @mousedown.self="emit('close')">
      <div class="cd" role="dialog" aria-modal="true" :aria-label="title">
        <div class="cd-head">
          <h3 class="cd-title">{{ title }}</h3>
          <button type="button" class="cd-close" aria-label="Закрыть" @click="emit('close')">×</button>
        </div>
        <p class="cd-message">{{ message }}</p>
        <div class="cd-actions">
          <button type="button" class="cd-btn cd-cancel" @click="emit('close')">Отмена</button>
          <button
            type="button"
            class="cd-btn"
            :class="danger ? 'cd-danger' : 'cd-primary'"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cd-overlay {
  position: fixed;
  inset: 0;
  z-index: 40000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
}
.cd {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.cd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e8e8e8;
}
.cd-title {
  font-size: 16px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0;
}
.cd-close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.cd-close:hover {
  background: #f2f2f2;
  color: #333;
}
.cd-message {
  margin: 0;
  padding: 18px 16px;
  font-size: 14px;
  line-height: 1.5;
  color: #444;
}
.cd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 16px 16px;
}
.cd-btn {
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}
.cd-cancel {
  background: #f2f2f2;
  color: #444;
}
.cd-cancel:hover {
  background: #e6e6e6;
}
.cd-primary {
  background: #1a73e8;
  color: #fff;
}
.cd-primary:hover {
  background: #1765cc;
}
.cd-danger {
  background: #d93025;
  color: #fff;
}
.cd-danger:hover {
  background: #c5221f;
}
</style>
