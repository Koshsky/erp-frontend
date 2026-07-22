import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProcessPlanning from './ProcessPlanning.vue'

const now = new Date()
const y = now.getFullYear()
const day = (month: number, d: number) => new Date(y, month - 1, d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const projects = [
  {
    id: 1,
    project_code: 'КО_505-S-ПТЗ_БСМП_МВС',
    processes: [
      { id: 1, title: 'Производство', start_date: iso(day(7, 15)), end_date: iso(day(8, 20)) },
      { id: 2, title: 'Инсталляция', start_date: iso(day(8, 5)), end_date: iso(day(8, 25)) },
    ],
  },
  {
    id: 2,
    project_code: 'КО_506-S-СПБ_ГБ_ТЕЛЕМЕД',
    processes: [
      { id: 3, title: 'Производство', start_date: iso(day(8, 1)), end_date: iso(day(9, 5)) },
      { id: 4, title: 'Инсталляция', start_date: iso(day(8, 20)), end_date: iso(day(9, 15)) },
    ],
  },
  {
    id: 3,
    project_code: 'КО_512-S-КРД_ОДКБ_ВИДЕО',
    processes: [
      { id: 5, title: 'Производство', start_date: iso(day(7, 20)), end_date: iso(day(8, 28)) },
      { id: 6, title: 'Инсталляция', start_date: iso(day(8, 15)), end_date: iso(day(9, 10)) },
    ],
  },
]

const meta: Meta<typeof ProcessPlanning> = {
  title: 'Components/Gantt/ProcessPlanning',
  component: ProcessPlanning,
  parameters: { layout: 'padded' },
  args: { mockProjects: projects },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
