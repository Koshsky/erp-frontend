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
      <div v-else class="st">
        <!-- Empty-state content (e.g. a create-action button); falls back to the text -->
        <slot name="empty">{{ emptyText }}</slot>
      </div>
    </template>
  </div>
</template>

<style scoped>
@import "../../../styles/tokens.css";

.pg {
  background: var(--ui-surface);
  border-radius: 10px;
  padding: 12px;
  box-shadow: var(--ui-shadow-sm);
}
.st {
  text-align: center;
  padding: 30px;
  color: var(--ui-text-2);
  font-size: 14px;
}
.pg-error {
  color: var(--ui-danger);
  font-size: 13px;
  padding: 8px 4px;
}
.er {
  color: var(--ui-danger);
}
</style>
