import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../store'
import MainLayout from '../layouts/MainLayout.vue'
import AuthLayout from '../layouts/AuthLayout.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: AuthLayout,
      children: [
        {
          path: '',
          name: 'login',
          component: () => import('../views/LoginPage.vue'),
        },
      ],
    },
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('../views/DashboardPage.vue'),
        },
        {
          path: 'planner',
          name: 'planner',
          component: () => import('../views/PlannerPage.vue'),
        },
        {
          path: 'projects',
          name: 'projects',
          component: () => import('../views/ProjectsPage.vue'),
        },
        {
          path: 'processes',
          name: 'processes',
          component: () => import('../views/ProcessesPage.vue'),
        },
        {
          path: 'resources',
          name: 'resources',
          component: () => import('../views/ResourcesPage.vue'),
        },
        {
          path: 'timesheet',
          name: 'timesheet',
          component: () => import('../views/TimesheetPage.vue'),
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('../views/ProfilePage.vue'),
        },
      ],
    },
  ],
})

// Глобальный guard: неавторизованных пользователей всегда отправляем на /login.
// Если access-токен отсутствует или протух, но есть refresh — сначала тихо обновляем сессию.
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && (!auth.isAuthenticated || auth.accessExpired)) {
    await auth.refreshSession()
  }

  // Страницы под главным layout требуют авторизации
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Уже авторизованных не пускаем на страницу входа
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  // Табель доступен только vp и admin
  if (to.name === 'timesheet' && !['vp', 'admin'].includes(auth.user?.role ?? '')) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
