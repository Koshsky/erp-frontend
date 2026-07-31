import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TaskPlanning from './TaskPlanning.vue'

const now = new Date()
const y = now.getFullYear()
const day = (month: number, d: number) => new Date(y, month - 1, d)
const iso = (d: Date) => d.toISOString().slice(0, 10)
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
  'Инсталляция оконечного оборудования',
  'Предоставить карту сети',
  'Монтаж кабеленесущих систем',
  'Осмотр объекта',
]

const processes = (startM: number, startD: number, endM: number, endD: number, code: string, offset: number) => ({
  id: 1,
  title: 'Инсталляция',
  project_code: code,
  start_date: iso(day(startM, startD)),
  end_date: iso(day(endM, endD)),
  tasks: taskTitles.map((title, i) => ({
    id: i + 1 + offset,
    title,
    start_date: iso(day(startM, startD + i * 2)),
    end_date: iso(day(startM, startD + i * 2 + 5)),
    resources: [{ resource_id: (i % 5) + 1, quantity: (i % 3) + 1, code: resources[i % 5].code }],
  })),
})
const meta: Meta<typeof TaskPlanning> = {
  title: 'Components/Planner/TaskPlanning',
  component: TaskPlanning,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>
export const SingleProject: Story = {
  args: {
    mockProcesses: [processes(7, 15, 8, 22, 'KO-1001', 0)],
    mockResources: resources,
  },
}

export const MultipleProjects: Story = {
  args: {
    mockProcesses: [
      processes(7, 15, 8, 22, 'KO-1001', 0),
      processes(8, 5, 9, 18, 'KO-1002', 100),
    ],
    mockResources: resources,
  },
}

