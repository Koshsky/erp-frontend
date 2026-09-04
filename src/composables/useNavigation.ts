import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore, useRbacStore } from '../store'

export interface NavItem {
  label: string
  to: string
  name: string
  /** The (resource, action) permission from the backend that unlocks this tab */
  perm?: [string, string]
  /** Role fallback — used only while the permission list is not loaded yet */
  roles?: string[] | null
  /** Compact badge shown on the right of the item ("new", a counter, etc.) */
  badge?: string | number
}

export interface NavCategory {
  label: string
  /** Role fallback while permissions are not loaded; null — all authenticated users */
  roles: string[] | null
  items: NavItem[]
}

/**
 * Sidebar menu categories; subcategories open in a popup overlay.
 * Item visibility is driven by the RBAC permissions from /permissions/me
 * (same pairs as the router pagePerm), not by hardcoded roles.
 */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    label: 'Планировщик',
    roles: null,
    items: [
      {
        label: 'Проекты',
        to: '/projects',
        name: 'projects',
        perm: ['project', 'view'],
        roles: ['dp', 'rp', 'admin'],
      },
      {
        label: 'Процессы',
        to: '/processes',
        name: 'processes',
        perm: ['process', 'view'],
        roles: ['dp', 'rp', 'admin'],
      },
      {
        label: 'Задачи',
        to: '/planner',
        name: 'planner',
        perm: ['task', 'view'],
        roles: ['dp', 'rp', 'admin', 'vp'],
      },
    ],
  },
  {
    label: 'Табель',
    roles: ['vp', 'admin'],
    items: [
      { label: 'Табель', to: '/timesheet', name: 'timesheet', perm: ['worker', 'view'] },
      { label: 'Сотрудники', to: '/employees', name: 'employees', perm: ['worker', 'view'] },
      { label: 'Ресурсы', to: '/resources', name: 'resources', perm: ['resource', 'view'] },
    ],
  },
  {
    label: 'Админ',
    roles: ['admin'],
    items: [
      { label: 'Пользователи', to: '/users', name: 'users', perm: ['user_admin', 'view'] },
      { label: 'Структура компании', to: '/structure', name: 'structure', perm: ['org_structure', 'view'] },
      { label: 'Автосоздание проектов', to: '/auto-create', name: 'auto-create', perm: ['rbac_config', 'view'] },
      { label: 'Статусы', to: '/statuses', name: 'statuses', perm: ['state_admin', 'view'] },
      { label: 'Права', to: '/permissions', name: 'permissions', perm: ['rbac_config', 'view'] },
      { label: 'Журнал действий', to: '/audit', name: 'audit', perm: ['audit', 'view'] },
    ],
  },
]

/** Navigation aware of the current user's RBAC permissions (role — only as a cold-start fallback) */
export function useNavigation() {
  const auth = useAuthStore()
  const rbac = useRbacStore()
  const route = useRoute()

  const role = computed(() => auth.user?.preset ?? '')

  /** Permissions arrived (or were cached) — the permission filter is authoritative */
  const permsReady = computed(() => rbac.permsLoaded || rbac.myPermissions.length > 0)

  /** Permission-filtered categories: items hidden without the right, emptied categories dropped */
  const visibleCategories = computed(() =>
    NAV_CATEGORIES.filter((c) => !c.roles || permsReady.value || c.roles.includes(role.value))
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => {
          if (permsReady.value) {
            return i.perm ? rbac.can(i.perm[0], i.perm[1]) : true
          }
          return !i.roles || i.roles.includes(role.value)
        }),
      }))
      .filter((c) => c.items.length > 0),
  )

  /** Category that owns the current route (for highlighting) */
  const activeCategory = computed(() =>
    visibleCategories.value.find((c) => c.items.some((i) => i.name === route.name)),
  )

  return { visibleCategories, activeCategory }
}