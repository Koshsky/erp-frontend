import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CalendarHeader from './CalendarHeader.vue'
import { makeDemoTimeline } from '@/components/planner/plannerStoryHelpers'

const now = new Date()
const y = now.getFullYear()
const iso = (m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const meta: Meta<typeof CalendarHeader> = {
  title: 'Components/Planner/CalendarHeader',
  component: CalendarHeader,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

function rangeStory(unit: 'day' | 'decade', startDay = 1): Story['render'] {
  return () => ({
    components: { CalendarHeader },
    data: () => ({ t: makeDemoTimeline(iso(1, startDay), unit, { windowStart: 0, viewportCells: 60 }) }),
    template: `
      <div style="width:3000px;position:relative;overflow:hidden;">
        <CalendarHeader :t="t" />
      </div>
    `,
  })
}

export const QuarterDays: Story = { render: rangeStory('day') }
export const QuarterDecades: Story = { render: rangeStory('decade') }
export const MidYearAnchor: Story = { render: rangeStory('day', 15) }
