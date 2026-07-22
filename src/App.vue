<script setup lang="ts">
import TaskPlanning from './components/TaskPlanning/TaskPlanning.vue'
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>MVS ERP — Диаграмма Гантта</h1>
    </header>
    <main class="app-main">
      <TaskPlanning />
    </main>
  </div>
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

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: #1a73e8;
  color: #fff;
  padding: 16px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.app-header h1 {
  font-size: 22px;
  font-weight: 600;
}

.app-main {
  flex: 1;
  padding: 24px;
}
</style>
