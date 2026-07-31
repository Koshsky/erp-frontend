<script setup lang="ts">
interface NavItem {
  label: string
  to: string
}

const items: NavItem[] = [
  { label: 'Дашборд', to: '/' },
  { label: 'Планировщик', to: '/planner' },
  { label: 'Проекты', to: '/projects' },
  { label: 'Ресурсы', to: '/resources' },
  { label: 'Профиль', to: '/profile' },
]
</script>

<template>
  <aside class="as">
    <nav class="as-nav">
      <RouterLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="as-link"
      >
        {{ item.label }}
      </RouterLink>
    </nav>
  </aside>
</template>

<style scoped>
.as {
  width: 200px;
  min-width: 200px;
  background: #fff;
  border-right: 1px solid #e8e8e8;
  padding: 16px 12px;
}

.as-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.as-link {
  display: block;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  color: #333;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.as-link:hover {
  background: #f1f4f9;
}

.as-link.router-link-exact-active {
  background: #e8f0fe;
  color: #1a73e8;
  font-weight: 600;
}

@media (max-width: 720px) {
  .as { width: 100%; min-width: 100%; border-right: none; border-bottom: 1px solid #e8e8e8; }
  .as-nav { flex-direction: row; flex-wrap: wrap; }
}
</style>
