import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProjectPlanning from './ProjectPlanning.vue'

const now = new Date()
const y = now.getFullYear()
const day = (month: number, d: number) => new Date(y, month - 1, d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

let idSeq = 0
const project = (code: string) => {
  idSeq += 1
  return {
    id: idSeq,
    project_code: code,
    start_date: iso(day(7, 15)),
    end_date: iso(day(9, 20)),
  }
}

const meta: Meta<typeof ProjectPlanning> = {
  title: 'Components/Planner/ProjectPlanning',
  component: ProjectPlanning,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const SingleProject: Story = {
  args: { projects: [project('КО_505-S-ПТЗ_БСМП_МВС')] },
}

export const MultipleProjects: Story = {
  args: {
    projects: [
      project('КО_505-S-ПТЗ_БСМП_МВС'),
      project('КО_506-S-СПБ_ГБ_ТЕЛЕМЕД'),
      project('КО_512-S-КРД_ОДКБ_ВИДЕО'),
    ],
  },
}

// Три варианта периода календаря: квартал, полугодие, год
const threeProjects = [
  project('КО_505-S-ПТЗ_БСМП_МВС'),
  project('КО_506-S-СПБ_ГБ_ТЕЛЕМЕД'),
  project('КО_512-S-КРД_ОДКБ_ВИДЕО'),
]

export const Quarter: Story = {
  args: { projects: threeProjects, period: 'quarter' },
}

export const HalfYear: Story = {
  args: { projects: threeProjects, period: 'half' },
}

export const FullYear: Story = {
  args: { projects: threeProjects, period: 'year' },
}

