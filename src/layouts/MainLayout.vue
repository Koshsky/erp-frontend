<script setup lang="ts">
import AppHeader from '../components/common/AppHeader.vue'
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

