<script setup lang="ts">
import OfflineBanner from './offline/OfflineBanner.vue'
import SyncToast from './offline/SyncToast.vue'
import { isElectron } from './electron'
</script>

<template>
  <OfflineBanner v-if="isElectron" />
  <SyncToast v-if="isElectron" />
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

/* Fixed planner cell width, responsive to the screen.
   Set on :root, grid tracks use var(--cell-width). */
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

