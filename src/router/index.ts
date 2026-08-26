import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore, useRbacStore } from '../store'
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

  // Права для навигации: загружаем один раз на сессию (кроме офлайна — кеш).
  const rbac = useRbacStore()
  if (auth.isAuthenticated && !rbac.permsLoaded && !isOffline.value) {
    await rbac.loadMyPermissions()
  }

  // Действия/страницы показываем по правам из матрицы, а не по ролям.
  // Бизнес-страницы — по праву view; админ-разделы — временный fallback
  // на роль (TODO: виртуальные ресурсы-разделы).
  const pagePerm: Record<string, [string, string] | 'admin'> = {
    timesheet: ['worker', 'view'],
    employees: ['worker', 'view'],
    projects: ['project', 'view'],
    processes: ['process', 'view'],
    planner: ['task', 'view'],
    resources: ['resource', 'view'],
    statuses: 'admin',
    users: 'admin',
    structure: 'admin',
    'auto-create': 'admin',
    permissions: 'admin',
  }
  const needed = pagePerm[to.name as string]
  if (needed && to.meta.requiresAuth) {
    const ok = needed === 'admin' ? auth.user?.role === 'admin' : rbac.can(needed[0], needed[1])
    if (!ok) return { name: 'dashboard' }
  }

  // Пользователь без прав ни на одну бизнес-страницу — только профиль
  // (сотрудник без назначенных прав; админ и роли с правами ходят дальше).
  if (
    to.name !== 'profile' &&
    to.name !== 'dashboard' &&
    to.name !== 'sync' &&
    !pagePerm[to.name as string] &&
    !rbac.can('project', 'view') &&
    !rbac.can('process', 'view') &&
    !rbac.can('task', 'view') &&
    !rbac.can('resource', 'view') &&
    !rbac.can('worker', 'view') &&
    auth.user?.role !== 'admin'
  ) {
    return { name: 'profile' }
  }

  // Синхронизация (офлайн-настройки) — доступна только в настольной (Electron)
  // сборке. В веб-версии офлайна нет, страница недоступна.
  if (to.name === 'sync' && !isElectron) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
