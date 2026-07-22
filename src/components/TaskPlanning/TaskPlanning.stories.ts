import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TaskPlanning from './TaskPlanning.vue'

const now = new Date()
const y = now.getFullYear()
const day = (month: number, d: number) => new Date(y, month - 1, d)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const t = (s: string) => s

const resources = [
  { id: 1, code: 'И', title: 'Инженер', quantity: 7 },
  { id: 2, code: 'М', title: 'Монтажник', quantity: 4 },
  { id: 3, code: 'ПР', title: 'Производитель работ', quantity: 2 },
  { id: 4, code: 'РГ', title: 'Руководитель группы', quantity: 4 },
  { id: 5, code: 'РСИ', title: 'Руководитель службы инсталляции', quantity: 1 },
]

const taskTitles = [
  'Подписание Акта ввода в эксплуатацию',
  'Список затраченных материалов',
  'Тестирование комплекса систем телемедицины (MVS VEGA)',
  'Проведение инструктажа и передача инструкций мед персоналу',
  'Пуско-наладочные работы',
  'Инсталляция оконечного оборудования телемедицины',
  'Предоставить карту сети',
  'Монтаж кабеленесущих систем и кабельных трасс',
  'Осмотр объекта',
]

const processes = [
  {
    id: 1, title: 'Инсталляция', project_code: 'KO-1001',
    start_date: iso(day(7, 15)), end_date: iso(day(8, 22)),
    tasks: [
      { id: 1, title: taskTitles[0], start_date: iso(day(7, 28)), end_date: iso(day(8, 22)), resources: [{ resource_id: 5, quantity: 1, code: 'РСИ' }] },
      { id: 2, title: taskTitles[1], start_date: iso(day(7, 20)), end_date: iso(day(8, 15)), resources: [{ resource_id: 1, quantity: 1, code: 'И' }] },
      { id: 3, title: taskTitles[2], start_date: iso(day(8, 1)), end_date: iso(day(8, 18)), resources: [{ resource_id: 1, quantity: 2, code: 'И' }, { resource_id: 3, quantity: 1, code: 'ПР' }] },
      { id: 4, title: taskTitles[3], start_date: iso(day(8, 10)), end_date: iso(day(8, 22)), resources: [{ resource_id: 4, quantity: 1, code: 'РГ' }] },
      { id: 5, title: taskTitles[4], start_date: iso(day(7, 25)), end_date: iso(day(8, 12)), resources: [{ resource_id: 3, quantity: 1, code: 'ПР' }] },
      { id: 6, title: taskTitles[5], start_date: iso(day(7, 20)), end_date: iso(day(8, 10)), resources: [{ resource_id: 1, quantity: 3, code: 'И' }, { resource_id: 2, quantity: 1, code: 'М' }] },
      { id: 7, title: taskTitles[6], start_date: iso(day(7, 18)), end_date: iso(day(7, 25)), resources: [{ resource_id: 1, quantity: 1, code: 'И' }] },
      { id: 8, title: taskTitles[7], start_date: iso(day(7, 18)), end_date: iso(day(8, 5)), resources: [{ resource_id: 2, quantity: 4, code: 'М' }] },
      { id: 9, title: taskTitles[8], start_date: iso(day(7, 15)), end_date: iso(day(7, 19)), resources: [{ resource_id: 1, quantity: 2, code: 'И' }] },
    ],
  },
  {
    id: 2, title: 'Инсталляция', project_code: 'KO-1002',
    start_date: iso(day(8, 5)), end_date: iso(day(9, 18)),
    tasks: [
      { id: 10, title: taskTitles[0], start_date: iso(day(9, 1)), end_date: iso(day(9, 18)), resources: [{ resource_id: 5, quantity: 1, code: 'РСИ' }] },
      { id: 11, title: taskTitles[5], start_date: iso(day(8, 10)), end_date: iso(day(8, 28)), resources: [{ resource_id: 2, quantity: 3, code: 'М' }, { resource_id: 1, quantity: 2, code: 'И' }] },
      { id: 12, title: taskTitles[8], start_date: iso(day(8, 5)), end_date: iso(day(8, 10)), resources: [{ resource_id: 1, quantity: 2, code: 'И' }] },
    ],
  },
]

const meta: Meta<typeof TaskPlanning> = {
  title: 'Components/Gantt/TaskPlanning',
  component: TaskPlanning,
  parameters: { layout: 'padded' },
  args: { mockProcesses: processes, mockResources: resources },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
