import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../store'

export interface NavItem {
  label: string
  to: string
  name: string
  /** Роли, которым виден пункт; null — всем авторизованным */
  roles?: string[] | null
}

export interface NavCategory {
  label: string
  /** Роли, которым видна категория целиком; null — всем авторизованным */
  roles: string[] | null
  items: NavItem[]
}

/** Категории бокового меню: подкатегории открываются во всплывающем оверлее */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    label: 'Планировщик',
    roles: null,
    items: [
      { label: 'Проекты', to: '/projects', name: 'projects', roles: ['dp', 'rp', 'admin'] },
      { label: 'Процессы', to: '/processes', name: 'processes', roles: ['dp', 'rp', 'admin'] },
      { label: 'Задачи', to: '/planner', name: 'planner', roles: ['dp', 'rp', 'admin', 'vp'] },
    ],
  },
  {
    label: 'Табель',
    roles: ['vp', 'admin'],
    items: [
      { label: 'Табель', to: '/timesheet', name: 'timesheet' },
      { label: 'Сотрудники', to: '/employees', name: 'employees' },
      { label: 'Ресурсы', to: '/resources', name: 'resources' },
    ],
  },
  {
    label: 'Админ',
    roles: ['admin'],
    items: [
      { label: 'Статусы', to: '/statuses', name: 'statuses' },
      { label: 'Права', to: '/permissions', name: 'permissions' },
    ],
  },
]

/** Прямые ссылки в шапке (вне категорий) */
export const STANDALONE_NAV: NavItem[] = [
  { label: 'Дашборд', to: '/', name: 'dashboard', roles: ['admin', 'dp', 'rp', 'vp'] },
]

/** Навигация с учётом роли текущего пользователя */
export function useNavigation() {
  const auth = useAuthStore()
  const route = useRoute()

  /** Категории с учётом роли: скрываются и закрытые для роли пункты, и опустевшие категории */
  const visibleCategories = computed(() =>
    NAV_CATEGORIES.filter((c) => !c.roles || c.roles.includes(auth.user?.role ?? ''))
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => !i.roles || i.roles.includes(auth.user?.role ?? '')),
      }))
      .filter((c) => c.items.length > 0),
  )

  /** Категория, которой принадлежит текущий маршрут (для подсветки) */
  const activeCategory = computed(() =>
    visibleCategories.value.find((c) => c.items.some((i) => i.name === route.name)),
  )

  /** Прямые ссылки с учётом роли (например, дашборд скрыт от worker) */
  const standalone = computed(() =>
    STANDALONE_NAV.filter((i) => !i.roles || i.roles.includes(auth.user?.role ?? '')),
  )

  return { visibleCategories, activeCategory, standalone }
}
