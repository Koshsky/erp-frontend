import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ResourceManagerModal from './ResourceManagerModal.vue'
import type { ResourceOption, AssignedResource } from './types'

const resources: ResourceOption[] = [
  { id: 1, code: 'И', title: 'Инженер' },
  { id: 2, code: 'МК', title: 'Монтажник конструкций' },
  { id: 3, code: 'СВ', title: 'Сварщик' },
  { id: 4, code: 'К', title: 'Крановщик' },
]

const assigned: AssignedResource[] = [
  { assignment_id: 1, resource_id: 1, quantity: 2, code: 'И', title: 'Инженер' },
  { assignment_id: 2, resource_id: 3, quantity: 1, code: 'СВ', title: 'Сварщик' },
]

const meta: Meta<typeof ResourceManagerModal> = {
  title: 'Components/Planner/ResourceManagerModal',
  component: ResourceManagerModal,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    open: true,
    taskId: 1,
    taskTitle: 'Монтаж конструкций',
    resources,
    assigned,
  },
}
export default meta
type Story = StoryObj<typeof meta>

/** Задача с назначенными ресурсами — список и форма добавления */
export const WithAssigned: Story = {}

/** Пустой список назначенных — пустое состояние «Ресурсы не назначены» */
export const Empty: Story = {
  args: {
    assigned: [],
  },
}

/** Все ресурсы уже заняты — выпадающий список добавления пуст */
export const AllResourcesAssigned: Story = {
  args: {
    assigned: resources.map((r, i) => ({
      assignment_id: i + 1,
      resource_id: r.id,
      quantity: 1,
      title: r.title,
      code: r.code,
    })),
  },
}

/** Ошибка от бэкенда показывается внутри окна */
export const WithError: Story = {
  args: {
    error: 'Не удалось назначить ресурс: конфликт с существующим назначением',
  },
}

/** Идёт запрос — кнопки и форма заблокированы */
export const Busy: Story = {
  args: {
    busy: true,
  },
}

/** У назначенного ресурса нет названия — показывается код или «Ресурс #id» */
export const AssignedWithoutTitle: Story = {
  args: {
    assigned: [
      { assignment_id: 7, resource_id: 2, quantity: 3, code: 'МК' },
      { assignment_id: 8, resource_id: 5, quantity: 1 },
    ],
  },
}
