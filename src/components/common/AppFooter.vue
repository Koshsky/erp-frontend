<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer class="af">
    <span>© {{ year }} MVS ERP</span>
  </footer>
</template>

<style scoped>
.af {
  background: #fff;
  border-top: 1px solid #e8e8e8;
  color: #999;
  font-size: 12px;
  padding: 12px 24px;
  text-align: center;
}
</style>
