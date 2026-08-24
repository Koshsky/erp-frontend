import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../store'
import { isOffline } from '../offline/state'
import { isElectron } from '../electron'
import { ensureDesktopAutoSyncSession } from '../offline/sync'
import { shouldAutoSync } from '../settings'
import { isLoggedOut } from '../loggedOut'
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
        {
          // Настройка адреса сервера — доступна до входа (нужно для exe:
          // на другом компьютере бэкенд может быть не на localhost).
          path: 'settings',
          name: 'server-settings',
          component: () => import('../views/ServerSettingsPage.vue'),
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
          path: 'employees',
          name: 'employees',
          component: () => import('../views/EmployeesPage.vue'),
        },
        {
          path: 'statuses',
          name: 'statuses',
          component: () => import('../views/StatusesPage.vue'),
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('../views/UsersPage.vue'),
        },
        {
          path: 'structure',
          name: 'structure',
          component: () => import('../views/CompanyStructure.vue'),
        },
        {
          path: 'auto-create',
          name: 'auto-create',
          component: () => import('../views/AutoCreatePage.vue'),
        },
        {
          path: 'permissions',
          name: 'permissions',
          component: () => import('../views/PermissionsPage.vue'),
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('../views/ProfilePage.vue'),
        },
        {
          path: 'sync',
          name: 'sync',
          component: () => import('../views/SyncPage.vue'),
        },
      ],
    },
  ],
})

// Глобальный guard: неавторизованных пользователей всегда отправляем на /login.
// Если access-токен отсутствует или протух, но есть refresh — сначала тихо
// обновляем сессию: web — refresh по куке, desktop — тихий re-login по кредам
// автосинка (refresh-кука не работает кросс-сайт). Офлайн — без попыток сети.
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (
    to.meta.requiresAuth &&
    (!auth.isAuthenticated || auth.accessExpired) &&
    !isOffline.value
  ) {
    if (isElectron && shouldAutoSync() && !isLoggedOut()) {
      await ensureDesktopAutoSyncSession()
    } else {
      await auth.refreshSession()
    }
  }

  // Страницы под главным layout требуют авторизации
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Уже авторизованных не пускаем на страницу входа
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: auth.user?.role === 'worker' ? 'profile' : 'dashboard' }
  }

  // worker видит только свой профиль: любые другие страницы — на profile
  if (auth.user?.role === 'worker' && to.name !== 'profile') {
    return { name: 'profile' }
  }

  // Табель и Сотрудники доступны только vp и admin
  if (
    (to.name === 'timesheet' || to.name === 'employees') &&
    !['vp', 'admin'].includes(auth.user?.role ?? '')
  ) {
    return { name: 'dashboard' }
  }

  // Статусы, Права, Пользователи, Структура, Автосоздание — только admin
  if (
    (to.name === 'statuses' || to.name === 'permissions' || to.name === 'users' || to.name === 'structure' || to.name === 'auto-create') &&
    auth.user?.role !== 'admin'
  ) {
    return { name: 'dashboard' }
  }

  // Синхронизация (офлайн-настройки) — доступна только в настольной (Electron)
  // сборке. В веб-версии офлайна нет, страница недоступна.
  if (to.name === 'sync' && !isElectron) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
