<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import AppHeader from '../components/common/AppHeader/AppHeader.vue'

/**
 * Глобальный перехват Ctrl/Cmd+P и Ctrl/Cmd+S: браузерные «Печать страницы»
 * и «Сохранить страницу» глушим на всём приложении (они перекрывают модалки),
 * а открытие модалки подготовки к печати делает слушатель события
 * app:print-request (PdfExport на странице «Задачи»).
 * Сопоставление идёт по e.code (физическая клавиша, не зависит от раскладки —
 * при русской ЙЦУКЕН e.key для P/S даёт «з»/«ы»), e.key — как fallback.
 * Слушаем на window в фазе capture: самое раннее перехватывание до браузера.
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

onMounted(() => window.addEventListener('keydown', onPrintHotkey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onPrintHotkey, true))
</script>

<template>
  <div class="ml">
    <AppHeader />
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

