<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../store'
import { useRoleAccess } from '../composables/useRoleAccess'

const store = useAppStore()
const { totalProjects, totalResources, projectsLoading, resourcesLoading } = storeToRefs(store)
const { canViewProjects } = useRoleAccess()

onMounted(() => {
  // Проекты видят только admin/dp/rp; vp/worker не получают их список (403 у бэкенда).
  if (canViewProjects.value) store.loadProjects()
  store.loadResources()
})

const quickLinks = computed(() => [
  ...(canViewProjects.value
    ? [{ label: 'Проекты', to: '/projects', desc: 'Список проектов' }]
    : []),
  { label: 'Ресурсы', to: '/resources', desc: 'Загрузка ресурсов' },
  { label: 'Диаграмма Гантта', to: '/planner', desc: 'Планирование задач и ресурсов' },
])
</script>

<template>
  <section class="dp">
    <h2 class="dp-title">Дашборд</h2>

    <div class="dp-stats">
      <div v-if="canViewProjects" class="stat">
        <div class="stat-num">{{ projectsLoading ? '…' : totalProjects }}</div>
        <div class="stat-label">Проектов</div>
      </div>
      <div class="stat">
        <div class="stat-num">{{ resourcesLoading ? '…' : totalResources }}</div>
        <div class="stat-label">Ресурсов</div>
      </div>
    </div>

    <div class="dp-links">
      <RouterLink
        v-for="link in quickLinks"
        :key="link.to"
        :to="link.to"
        class="card"
      >
        <div class="card-label">{{ link.label }}</div>
        <div class="card-desc">{{ link.desc }}</div>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.dp-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 20px;
}

.dp-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.stat {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
}

.stat-num {
  font-size: 32px;
  font-weight: 700;
  color: #1a73e8;
}

.stat-label {
  font-size: 13px;
  color: #888;
  margin-top: 4px;
}

.dp-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.card {
  display: block;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  text-decoration: none;
  border: 1px solid transparent;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.card:hover {
  border-color: #1a73e8;
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.card-label {
  font-size: 16px;
  font-weight: 600;
  color: #1a73e8;
  margin-bottom: 6px;
}

.card-desc {
  font-size: 13px;
  color: #777;
}
</style>
