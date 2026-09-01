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
          // Server address settings — available before login (needed for the exe:
          // on another machine the backend may not be on localhost).
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
        // Main screen: the first tab the user may access by permissions.
        // The guard below double-checks the landing page (pageAccessible),
        // so a wrong pick (role fallback) is corrected there. Until the
        // permissions arrive the role fallback chooses the tab.
        {
          path: '',
          name: 'home',
          redirect: () => {
            const rbac = useRbacStore()
            const auth = useAuthStore()
            const permsReady = rbac.permsLoaded || rbac.myPermissions.length > 0
            const role = auth.user?.role ?? ''
            const tab = FIRST_ACCESSIBLE_TABS.find(([, perm, roles]) =>
              permsReady ? !perm || rbac.can(perm[0], perm[1]) : roles.includes(role),
            )
            return tab ? { name: tab[0] } : { name: 'profile' }
          },
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
          // Create / edit user — a dedicated page instead of a modal
          path: 'users/new',
          name: 'user-new',
          component: () => import('../views/UserFormPage.vue'),
        },
        {
          path: 'users/:id/edit',
          name: 'user-edit',
          component: () => import('../views/UserFormPage.vue'),
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
          path: 'profile/edit',
          name: 'profile-edit',
          component: () => import('../views/ProfileEditPage.vue'),
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
 * Page access by matrix permission (a resource/action pair from `pagePerm`),
 * WAITING for the permissions to load first. On a cold start (page reload)
 * the store is fresh: deciding access before /permissions/me (or the offline
 * cache) arrives would see an empty permission list and wrongly send the user
 * to the profile. If permissions could not be obtained at all (no network and
 * no cache) — fall back to the planner nav roles.
 *
 * The wait is bounded (PERMS_BOUND_MS): with a saved session but a
 * stale/unreachable server, /permissions/me used to hold the FIRST navigation
 * for the whole axios timeout (~10 s), keeping the boot splash up that long
 * ("infinite loading"). If permissions do not arrive in time, navigation
 * proceeds with the role fallback and the app re-checks them later.
 */
const PLANNER_ROLES = ['admin', 'dp', 'rp', 'vp']
const PERMS_BOUND_MS = 3000

/**
 * Landing tab priority: name, the permission that unlocks it (null — always
 * available), and the role fallback used until the permissions arrive.
 * Mirrors the nav order in useNavigation.
 */
const FIRST_ACCESSIBLE_TABS: Array<[string, [string, string] | null, string[]]> = [
  ['planner', ['task', 'view'], PLANNER_ROLES],
  ['projects', ['project', 'view'], ['dp', 'rp', 'admin']],
  ['processes', ['process', 'view'], ['dp', 'rp', 'admin']],
  ['timesheet', ['worker', 'view'], ['vp', 'admin']],
  ['employees', ['worker', 'view'], ['vp', 'admin']],
  ['resources', ['resource', 'view'], ['vp', 'admin']],
  ['users', ['user_admin', 'view'], ['admin']],
  ['statuses', ['state_admin', 'view'], ['admin']],
  ['structure', ['org_structure', 'view'], ['admin']],
  ['auto-create', ['rbac_config', 'view'], ['admin']],
  ['permissions', ['rbac_config', 'view'], ['admin']],
]

async function pageAccessible(
  rbac: ReturnType<typeof useRbacStore>,
  role: string | undefined,
  resource: string,
  action: string,
): Promise<boolean> {
  if (!rbac.permsLoaded) {
    const ok = await Promise.race([
      rbac.loadMyPermissions(),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), PERMS_BOUND_MS)),
    ])
    if (!ok && !rbac.permsLoaded) return PLANNER_ROLES.includes(role ?? '')
  }
  return rbac.can(resource, action)
}

/**
 * Desktop silent re-login must never block first paint: with a saved session
 * and a stale/unreachable server address (an old profile can hold one), the
 * login request used to keep the router guard waiting until axios timed out —
 * the window stayed blank that whole time ("white screen"). The wait is now
 * bounded; if the login did not finish in time, the app renders anyway and a
 * late successful restore navigates in automatically (see main.ts watcher).
 */
const DESKTOP_AUTOSYNC_BOUND_MS = 2500

// Global guard: unauthenticated users always go to /login.
// If the access token is missing or expired but a refresh cookie exists — first silently
// refresh the session: web — refresh via the cookie, desktop — silent re-login with auto-sync
// credentials (the refresh cookie does not work cross-site). Offline — no network attempts.
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (
    to.meta.requiresAuth &&
    (!auth.isAuthenticated || auth.accessExpired) &&
    !isOffline.value
  ) {
    if (isElectron && shouldAutoSync() && !isLoggedOut()) {
      await Promise.race([
        ensureDesktopAutoSyncSession().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, DESKTOP_AUTOSYNC_BOUND_MS)),
      ])
    } else {
      // Desktop without autosync (disabled or after logout): the refresh
      // request is bounded by the axios timeout, but a stale server must not
      // hold first paint — cap the wait on desktop too. Web keeps the normal
      // cookie refresh (fast and same-origin).
      const refresh =
        isElectron && !isOffline.value
          ? Promise.race([
              auth.refreshSession(),
              new Promise<boolean>((resolve) =>
                setTimeout(() => resolve(false), DESKTOP_AUTOSYNC_BOUND_MS),
              ),
            ])
          : auth.refreshSession()
      await refresh
    }
  }

  // Pages under the main layout require authentication
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Already-authenticated users are not allowed on the login page
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' }
  }

  // The permission gate below (pageAccessible) waits for the permissions on
  // every guarded page — no fire-and-forget load here, otherwise it would race
  // the awaited load with a duplicate /permissions/me request.
  const rbac = useRbacStore()

  // Show actions/pages by matrix permissions, not by roles.
  // Business pages — by the view permission; admin sections — a temporary fallback
  // to the role (TODO: virtual resource sections).
  const pagePerm: Record<string, [string, string]> = {
    timesheet: ['worker', 'view'],
    employees: ['worker', 'view'],
    projects: ['project', 'view'],
    processes: ['process', 'view'],
    planner: ['task', 'view'],
    resources: ['resource', 'view'],
    statuses: ['state_admin', 'view'],
    users: ['user_admin', 'view'],
    'user-new': ['user_admin', 'view'],
    'user-edit': ['user_admin', 'view'],
    structure: ['org_structure', 'view'],
    'auto-create': ['rbac_config', 'view'],
    permissions: ['rbac_config', 'view'],
  }
  const needed = pagePerm[to.name as string]
  if (needed && to.meta.requiresAuth) {
    // Decide access by matrix permissions after WAITING for them: on a cold
    // start (F5 / Ctrl+Shift+R) rbac.can() evaluated before the permissions
    // arrive sees an empty list and wrongly redirects the page to the profile.
    const allowed = await pageAccessible(rbac, auth.user?.role, needed[0], needed[1])
    if (!allowed) {
      return { name: 'profile' }
    }
  }

  // User with permission to no business page — profile only
  // (an employee without assigned permissions; admin and roles with permissions continue further).
  if (
    to.meta.requiresAuth &&
    to.name !== 'profile' &&
    to.name !== 'profile-edit' &&
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

  // Sync (offline settings) — available only in the desktop (Electron)
  // build. The web version has no offline, so the page is unavailable.
  if (to.name === 'sync' && !isElectron) {
    return { name: 'home' }
  }

  // Server address settings — desktop (Electron) build only. In the online
  // (web) version the address is set at deployment (same-origin nginx proxy),
  // the screen is unavailable.
  if (to.name === 'server-settings' && !isElectron) {
    return { name: 'login' }
  }

  return true
})

export default router
