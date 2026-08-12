import { ref } from 'vue'
import type { Ref } from 'vue'

/**
 * Реактивное состояние сети. Обновляется событиями window online/offline.
 * Используется, чтобы офлайн не выбрасывало на /login (refresh токена) и для
 * баннера «офлайн-режим».
 */
export const isOffline: Ref<boolean> = ref(
  typeof navigator !== 'undefined' && navigator.onLine === false,
)

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOffline.value = false
  })
  window.addEventListener('offline', () => {
    isOffline.value = true
  })
}
