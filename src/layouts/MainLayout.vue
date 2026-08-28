<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import AppHeader from '../components/common/AppHeader/AppHeader.vue'
import { useRbacStore } from '../store'
import { isOffline } from '../offline/state'

// Local computed over the imported ref — guaranteed reactivity in the template
const offline = computed(() => isOffline.value)

/**
 * Global Ctrl/Cmd+P and Ctrl/Cmd+S interception: the browser's "Print page"
 * and "Save page" are suppressed across the whole app (they cover modals),
 * while opening the print-preparation modal is done by the
 * app:print-request event listener (PdfExport on the "Tasks" page).
 * Matching goes by e.code (physical key, independent of the layout —
 * on the Russian ЙЦУКЕН layout e.key for P/S yields «з»/«ы»), e.key as a fallback.
 * We listen on window in the capture phase: the earliest interception before the browser.
 */
function onPrintHotkey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    const code = e.code
    const key = e.key.toLowerCase()
    if (code === 'KeyP' || code === 'KeyS' || key === 'p' || key === 's') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('app:print-request'))
    }
  }
}

const rbac = useRbacStore()
let stopPermissionSync: (() => void) | undefined

onMounted(() => {
  window.addEventListener('keydown', onPrintHotkey, true)
  stopPermissionSync = rbac.startPermissionSync()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onPrintHotkey, true)
  stopPermissionSync?.()
})
</script>

<template>
  <div class="ml">
    <AppHeader />
    <!-- Global offline indicator (Desktop): data from cache, changes accumulate in the queue -->
    <div v-if="offline" class="ml-offline" role="status">
      Офлайн-режим: данные из кэша, изменения копятся в очереди
    </div>
    <div class="ml-body">
      <main class="ml-main">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.ml {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f4f6f9;
}

.ml-offline {
  padding: 8px 24px;
  background: #fdecea;
  color: #b23b2e;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  border-bottom: 1px solid #f3c4c1;
}

.ml-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 0;
}

.ml-main {
  flex: 1;
  padding: 24px;
  overflow-x: auto;
}
</style>

