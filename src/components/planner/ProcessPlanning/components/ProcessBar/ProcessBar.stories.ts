import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProcessBar from './ProcessBar.vue'
import { makeDemoTimeline } from '@/components/planner/plannerStoryHelpers'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const meta: Meta<typeof ProcessBar> = {
  title: 'Components/Planner/ProcessBar',
  component: ProcessBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

function withProcess(props: Record<string, any>): Story['render'] {
  return () => ({
    components: { ProcessBar },
    data: () => ({ timeline: makeDemoTimeline(iso(day(1, 1)), 'day'), ...props }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;overflow-x:auto;">
        <div style="position:relative;width:3000px;height:36px;background:#f0f0f0;border-radius:6px;">
          <ProcessBar
            :timeline="timeline"
            :startDate="startDate"
            :endDate="endDate"
            :title="title"
            :projectCode="projectCode"
            :ownerName="ownerName"
            :color="color"
            :opacity="opacity"
          />
        </div>
      </div>
    `,
  })
}

export const Default: Story = {
  render: withProcess({
    startDate: iso(day(1, 10)),
    endDate: iso(day(2, 20)),
    title: 'Инсталляция',
    projectCode: 'КО-001',
    ownerName: 'ВП-1',
  }),
}
export const FullMonth: Story = {
  render: withProcess({
    startDate: iso(day(1, 1)),
    endDate: iso(day(1, 31)),
    title: 'Производство',
    projectCode: 'КО-001',
  }),
}
export const WithBounds: Story = {
  render: withProcess({
    startDate: iso(day(1, 15)),
    endDate: iso(day(2, 10)),
    title: 'Инсталляция',
    projectCode: 'КО-002',
    groupStartDate: iso(day(1, 5)),
    groupEndDate: iso(day(2, 25)),
  }),
}
