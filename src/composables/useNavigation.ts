import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../store'

export interface NavItem {
  label: string
  to: string
  name: string
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
      { label: 'Задачи', to: '/planner', name: 'planner' },
      { label: 'Процессы', to: '/processes', name: 'processes' },
      { label: 'Проекты', to: '/projects', name: 'projects' },
    ],
  },
  {
    label: 'Табель',
    roles: ['vp', 'admin'],
    items: [
      { label: 'Ресурсы', to: '/resources', name: 'resources' },
      { label: 'Сотрудники', to: '/employees', name: 'employees' },
      { label: 'Табель', to: '/timesheet', name: 'timesheet' },
      { label: 'Статусы', to: '/statuses', name: 'statuses' },
    ],
  },
]

/** Прямые ссылки в шапке (вне категорий) */
export const STANDALONE_NAV: NavItem[] = [
  { label: 'Дашборд', to: '/', name: 'dashboard' },
  { label: 'Профиль', to: '/profile', name: 'profile' },
]

/** Навигация с учётом роли текущего пользователя */
export function useNavigation() {
  const auth = useAuthStore()
  const route = useRoute()

  const visibleCategories = computed(() =>
    NAV_CATEGORIES.filter((c) => !c.roles || c.roles.includes(auth.user?.role ?? '')),
  )

  /** Категория, которой принадлежит текущий маршрут (для подсветки) */
  const activeCategory = computed(() =>
    visibleCategories.value.find((c) => c.items.some((i) => i.name === route.name)),
  )

  return { visibleCategories, activeCategory, standalone: STANDALONE_NAV }
}
