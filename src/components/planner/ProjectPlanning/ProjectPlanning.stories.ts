import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProjectPlanning from './ProjectPlanning.vue'

const now = new Date()
const y = now.getFullYear()
const day = (month: number, d: number) => new Date(y, month - 1, d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

let idSeq = 0
const project = (
  code: string,
  start: [number, number],
  end: [number, number],
) => {
  idSeq += 1
  return {
    id: idSeq,
    project_code: code,
    start_date: iso(day(start[0], start[1])),
    end_date: iso(day(end[0], end[1])),
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
  args: { projects: [project('КО_505-S-ПТЗ_БСМП_МВС', [7, 15], [9, 20])] },
}

export const MultipleProjects: Story = {
  args: {
    projects: [
      project('КО_505-S-ПТЗ_БСМП_МВС', [7, 15], [9, 20]),
      project('КО_506-S-СПБ_ГБ_ТЕЛЕМЕД', [8, 1], [11, 5]),
      project('КО_512-S-КРД_ОДКБ_ВИДЕО', [6, 20], [10, 15]),
    ],
  },
}

// Три варианта периода календаря: квартал, полугодие, год
const threeProjects = [
  project('КО_505-S-ПТЗ_БСМП_МВС', [7, 15], [9, 20]),
  project('КО_506-S-СПБ_ГБ_ТЕЛЕМЕД', [8, 5], [11, 10]),
  project('КО_512-S-КРД_ОДКБ_ВИДЕО', [6, 25], [10, 20]),
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


