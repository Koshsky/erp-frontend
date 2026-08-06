<script setup lang="ts">
import type { PlannerStatesProps } from './types'

withDefaults(defineProps<PlannerStatesProps>(), {
  emptyText: 'Нет данных',
})
</script>

<template>
  <div class="pg">
    <div v-if="loading" class="st">Загрузка...</div>
    <template v-else>
      <p v-if="error" class="pg-error">{{ error }}</p>
      <slot v-if="hasData" />
      <div v-else-if="error" class="st er">{{ error }}</div>
      <div v-else class="st">{{ emptyText }}</div>
    </template>
  </div>
</template>

<style scoped>
.pg {
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
}
.st {
  text-align: center;
  padding: 30px;
  color: #666;
  font-size: 14px;
}
.pg-error {
  color: #d93025;
  font-size: 13px;
  padding: 8px 4px;
}
.er {
  color: #d93025;
}
</style>
