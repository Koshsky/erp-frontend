import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProjectPlanning from './ProjectPlanning.vue'

const now = new Date()
const y = now.getFullYear()
const day = (month: number, d: number) => new Date(y, month - 1, d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const projects = [
  {
    id: 1,
    project_code: 'КО_505-S-ПТЗ_БСМП_МВС',
    start_date: iso(day(7, 15)),
    end_date: iso(day(9, 20)),
  },
  {
    id: 2,
    project_code: 'КО_506-S-СПБ_ГБ_ТЕЛЕМЕД',
    start_date: iso(day(8, 1)),
    end_date: iso(day(10, 5)),
  },
  {
    id: 3,
    project_code: 'КО_512-S-КРД_ОДКБ_ВИДЕО',
    start_date: iso(day(7, 20)),
    end_date: iso(day(9, 28)),
  },
]

const meta: Meta<typeof ProjectPlanning> = {
  title: 'Components/Gantt/ProjectPlanning',
  component: ProjectPlanning,
  parameters: { layout: 'padded' },
  args: { projects },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
