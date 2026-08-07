<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../store'
import { useRoleAccess } from '../../../composables/useRoleAccess'

const props = withDefaults(defineProps<{ brand?: string }>(), { brand: 'MVS ERP' })

const router = useRouter()
const authStore = useAuthStore()

// ВП (владелец процессов) не видит вкладки проектов и процессов
const { hideProjectsNav, canManageTimesheet } = useRoleAccess()

function onLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <header class="ah">
    <div class="ah-brand">{{ props.brand }}</div>
    <nav class="ah-nav">
      <RouterLink to="/">Дашборд</RouterLink>
      <RouterLink v-if="!hideProjectsNav" to="/projects">Проекты</RouterLink>
      <RouterLink v-if="!hideProjectsNav" to="/processes">Процессы</RouterLink>
      <RouterLink to="/planner">Задачи</RouterLink>
      <RouterLink to="/resources">Ресурсы</RouterLink>
      <RouterLink v-if="canManageTimesheet" to="/timesheet">Табель</RouterLink>
      <RouterLink to="/profile">Профиль</RouterLink>
    </nav>
    <div class="ah-spacer"></div>
    <button type="button" class="ah-logout" @click="onLogout">Выйти</button>
  </header>
</template>

<style scoped>
.ah {
  background: #1a73e8;
  color: #fff;
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  position: sticky;
  top: 0;
  z-index: 20;
}

.ah-brand {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.ah-nav {
  display: flex;
  gap: 8px;
}

.ah-nav a {
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}

.ah-nav a:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.ah-nav a.router-link-exact-active {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-weight: 600;
}

.ah-spacer {
  flex: 1;
}

.ah-logout {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.ah-logout:hover {
  background: rgba(255, 255, 255, 0.28);
  color: #fff;
}

@media (max-width: 720px) {
  .ah { flex-direction: column; height: auto; padding: 12px; gap: 12px; }
  .ah-spacer { display: none; }
}
</style>

