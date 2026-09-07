import type { Meta, StoryObj } from '@storybook/vue3-vite'
import type { NavCategory } from '../../../composables/useNavigation'
import AppNavDrawer from './AppNavDrawer.vue'

/** Permission-free test data that mirrors the real NAV_CATEGORIES */
const testCategories: NavCategory[] = [
  {
    label: 'Планировщик',
    roles: null,
    items: [
      { label: 'Проекты', to: '/projects', name: 'projects' },
      { label: 'Процессы', to: '/processes', name: 'processes' },
      { label: 'Задачи', to: '/planner', name: 'planner' },
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
      { label: 'Пользователи', to: '/users', name: 'users' },
      { label: 'Структура компании', to: '/structure', name: 'structure' },
      { label: 'Автосоздание проектов', to: '/auto-create', name: 'auto-create', badge: 'new' },
      { label: 'Статусы', to: '/statuses', name: 'statuses' },
      { label: 'Права', to: '/permissions', name: 'permissions' },
      { label: 'Журнал действий', to: '/audit', name: 'audit' },
    ],
  },
  {
    label: 'Система',
    roles: null,
    items: [
      { label: 'Пульт', to: '/system/console', name: 'system-console' },
      { label: 'Очередь изменений', to: '/system/queue', name: 'system-queue' },
      { label: 'Статус', to: '/system/status', name: 'system-status' },
      { label: 'Настройки', to: '/system/settings', name: 'system-settings' },
    ],
  },
]

const meta: Meta<typeof AppNavDrawer> = {
  title: 'Components/Common/AppNavDrawer',
  component: AppNavDrawer,
  tags: ['autodocs'],
  args: {
    open: true,
    categories: testCategories,
    activeName: 'planner',
    brand: 'MVS ERP',
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}

/** The "Система" group collapsed; other sections render as usual */
export const SystemGroupCollapsed: Story = {
  args: {
    activeName: 'system-console',
  },
}