<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '../components/common/AppHeader/AppHeader.vue'
import AppNavDrawer from '../components/common/AppNavDrawer/AppNavDrawer.vue'
import { useRbacStore } from '../store'
import { useNavigation } from '../composables/useNavigation'
import { saveCategoryOrder, saveItemOrder } from '../composables/useNavigationOrder'
import { installDrawerEdgeDetection, isNavOpen } from '../composables/useNavDrawer'

const route = useRoute()
const rbac = useRbacStore()
const { visibleCategories } = useNavigation()

/** Applies a section drag onto the navigation order. */
function onReorderCategory(p: { from: number; to: number }) {
  const labels = visibleCategories.value.map((c) => c.label)
  saveCategoryOrder(labels, p.from, p.to)
}

/** Applies a subsection drag (only within its parent section). */
function onReorderItem(p: { catLabel: string; from: number; to: number }) {
  const cat = visibleCategories.value.find((c) => c.label === p.catLabel)
  const names = cat ? cat.items.map((i) => i.name) : []
  if (names.length) saveItemOrder(p.catLabel, names, p.from, p.to)
}

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
      @reorder-category="onReorderCategory"
      @reorder-item="onReorderItem"
    />
    <div class="ml-col">
      <AppHeader />
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

/* Content column: header + scrollable main area */
.ml-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
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