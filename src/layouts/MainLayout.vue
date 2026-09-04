<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '../components/common/AppHeader/AppHeader.vue'
import AppNavDrawer from '../components/common/AppNavDrawer/AppNavDrawer.vue'
import { useRbacStore } from '../store'
import { useNavigation } from '../composables/useNavigation'
import { installDrawerEdgeDetection, isNavOpen } from '../composables/useNavDrawer'
import { useSyncStatus } from '../composables/useSyncStatus'
import { isOffline } from '../offline/state'

const route = useRoute()
const rbac = useRbacStore()
const { visibleCategories } = useNavigation()
const { syncStats } = useSyncStatus()

// Local computed wrapping the imported ref — guaranteed reactivity in the template
const offline = computed(() => isOffline.value)

// Route name as a plain string (route.name can also be a symbol in edge cases)
const routeName = computed(() => (typeof route.name === 'string' ? route.name : undefined))

let stopPermissionSync: (() => void) | undefined
let stopDrawerDetection: (() => void) | undefined

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

onMounted(() => {
  window.addEventListener('keydown', onPrintHotkey, true)
  stopPermissionSync = rbac.startPermissionSync()
  stopDrawerDetection = installDrawerEdgeDetection()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onPrintHotkey, true)
  stopPermissionSync?.()
  stopDrawerDetection?.()
})
</script>

<template>
  <div class="ml">
    <!-- Navigation drawer as a real layout column: when open it takes
         NAV_WIDTH and the content column smoothly shifts to the right -->
    <AppNavDrawer
      :open="isNavOpen"
      :categories="visibleCategories"
      :active-name="routeName"
      :sync="syncStats"
    />
    <div class="ml-col">
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
  </div>
</template>

<style scoped>
@import '../styles/tokens.css';

.ml {
  height: 100vh;
  height: 100dvh; /* exact device viewport; the page can never exceed it */
  overflow: hidden; /* no page scroll / page scrollbar — content scrolls inside */
  display: flex;
  flex-direction: row;
  background: var(--ui-bg);
}

/* Content column: header + offline banner + scrollable main area */
.ml-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ml-offline {
  padding: 8px 24px;
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  border-bottom: 1px solid var(--ui-border);
}

.ml-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin: 0;
}

.ml-main {
  flex: 1;
  min-height: 0;
  padding: 24px;
  overflow: auto; /* non-diagram pages scroll inside the frame, not the browser */
  /* reserved gutter: pages with and without a scrollbar have the same content
     width — nothing shifts when switching between lists and diagrams */
  scrollbar-gutter: stable;
}
</style>