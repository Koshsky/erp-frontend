<script setup lang="ts">
import OfflineBanner from './offline/OfflineBanner.vue'
</script>

<template>
  <OfflineBanner />
  <RouterView />
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  background: #f4f6f9;
  color: #2c3e50;
}

/* Фиксированная ширина ячейки планировщика, адаптивная под экран.
   Задаётся на :root, треки грида используют var(--cell-width). */
:root {
  --cell-width: 32px;
}
@media (min-width: 1200px) {
  :root {
    --cell-width: 40px;
  }
}
@media (min-width: 1600px) {
  :root {
    --cell-width: 48px;
  }
}
@media (min-width: 1920px) {
  :root {
    --cell-width: 56px;
  }
}
</style>

