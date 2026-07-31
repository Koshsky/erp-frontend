<template>
  <div class="al">
    <RouterView />
  </div>
</template>

<style scoped>
.al {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 15% 20%, rgba(255, 255, 255, 0.12), transparent 35%),
    radial-gradient(circle at 85% 80%, rgba(255, 255, 255, 0.10), transparent 40%),
    linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%);
  overflow: hidden;
}
</style>

