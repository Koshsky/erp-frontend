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
]

const meta: Meta<typeof AppNavDrawer> = {
  title: 'Components/Common/AppNavDrawer',
  component: AppNavDrawer,
  parameters: { layout: 'fullscreen' },
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

/** Desktop build: the sync status footer is present */
export const WithSyncFooter: Story = {
  args: {
    sync: { enabled: true, offline: false, pending: 3, lastPullLabel: '12 мин' },
  },
}

/** Desktop offline: amber dot and "from cache" copy */
export const OfflineSync: Story = {
  args: {
    sync: { enabled: true, offline: true, pending: 5, lastPullLabel: '40 мин' },
  },
}

/** Web build: no sync footer at all */
export const WebWithoutSync: Story = {
  args: {
    sync: undefined,
  },
}