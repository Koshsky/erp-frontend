import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LabeledBar from './LabeledBar.vue'
import { makeDemoTimeline } from '@/components/planner/plannerStoryHelpers'

const meta: Meta<typeof LabeledBar> = {
  title: 'Components/Planner/LabeledBar',
  component: LabeledBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

const base = {
  timeline: makeDemoTimeline('2026-08-01', 'day'),
  startDate: '2026-08-03',
  endDate: '2026-08-14',
}

export const Default: Story = {
  args: { ...base, title: 'Инсталляция', projectCode: 'КО-01' },
}

export const Process: Story = {
  args: {
    ...base,
    title: 'Процесс',
    projectCode: 'КО-01',
    color: '#1a73e8',
    opacity: 0.85,
    minWidth: 40,
    padding: '0 10px',
    shadow: true,
  },
}

export const Project: Story = {
  args: {
    ...base,
    title: 'КО-01_РП1_ВП1',
    color: '#1a73e8',
    opacity: 0.85,
    height: 40,
    top: 6,
  },
}
