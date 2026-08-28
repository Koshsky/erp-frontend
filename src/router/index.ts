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
        // Главный экран: планировщик задач, если он доступен по правам
        // (task.view), иначе — профиль. Решение принимает guard после
        // redirect'а на /planner (см. plannerAccessible ниже).
        {
          path: '',
          name: 'home',
          redirect: { name: 'planner' },
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

/**
 * Главный экран — планировщик задач, если он доступен по RBAC (task.view),
 * иначе страница профиля. Права грузятся асинхронно (онлайн — /permissions/me,
 * офлайн — кэш), поэтому для корневого перехода дожидаемся их, чтобы «холодный»
 * старт не уводил на профиль ошибочно; если права получить не удалось совсем
 * (нет сети и кэша) — fallback на роли навигации планировщика.
 */
const PLANNER_ROLES = ['admin', 'dp', 'rp', 'vp']

async function plannerAccessible(
  rbac: ReturnType<typeof useRbacStore>,
  role?: string,
): Promise<boolean> {
  if (!rbac.permsLoaded) {
    const ok = await rbac.loadMyPermissions()
    if (!ok && !rbac.permsLoaded) return PLANNER_ROLES.includes(role ?? '')
  }
  return rbac.can('task', 'view')
}

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
    return { name: 'home' }
  }

  // Права для навигации: загружаем один раз на сессию (кроме офлайна — кеш).
  const rbac = useRbacStore()
  // Для /planner права ждём ниже (plannerAccessible) — здесь не дублируем запрос.
  if (auth.isAuthenticated && !rbac.permsLoaded && !isOffline.value && to.name !== 'planner') {
    // Не блокируем навигацию сетью: права подгружаются асинхронно
    // (кнопки появятся по мере загрузки; поллинг обновляет дальше).
    void rbac.loadMyPermissions()
  }

  // Действия/страницы показываем по правам из матрицы, а не по ролям.
  // Бизнес-страницы — по праву view; админ-разделы — временный fallback
  // на роль (TODO: виртуальные ресурсы-разделы).
  const pagePerm: Record<string, [string, string]> = {
    timesheet: ['worker', 'view'],
    employees: ['worker', 'view'],
    projects: ['project', 'view'],
    processes: ['process', 'view'],
    planner: ['task', 'view'],
    resources: ['resource', 'view'],
    statuses: ['state_admin', 'view'],
    users: ['user_admin', 'view'],
    structure: ['org_structure', 'view'],
    'auto-create': ['rbac_config', 'view'],
    permissions: ['rbac_config', 'view'],
  }
  const needed = pagePerm[to.name as string]
  if (needed && to.meta.requiresAuth) {
    // Главный экран решаем по правам из матрицы, дождавшись их загрузки
    // (иначе «холодный» старт ошибочно уводил бы на профиль).
    const allowed =
      to.name === 'planner'
        ? await plannerAccessible(rbac, auth.user?.role)
        : rbac.can(needed[0], needed[1])
    if (!allowed) {
      return { name: 'profile' }
    }
  }

  // Пользователь без прав ни на одну бизнес-страницу — только профиль
  // (сотрудник без назначенных прав; админ и роли с правами ходят дальше).
  if (
    to.meta.requiresAuth &&
    to.name !== 'profile' &&
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
    return { name: 'home' }
  }

  // Настройки адреса сервера — только настольная (Electron) сборка. В онлайн
  // (веб) версии адрес задаётся при развёртывании (same-origin nginx-прокси),
  // экран недоступен.
  if (to.name === 'server-settings' && !isElectron) {
    return { name: 'login' }
  }

  return true
})

export default router
