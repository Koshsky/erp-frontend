import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProjectBar from './ProjectBar.vue'
import { makeDemoTimeline } from '@/components/planner/plannerStoryHelpers'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const meta: Meta<typeof ProjectBar> = {
  title: 'Components/Planner/ProjectBar',
  component: ProjectBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

function withProject(props: Record<string, any>): Story['render'] {
  return () => ({
    components: { ProjectBar },
    data: () => ({ timeline: makeDemoTimeline(iso(day(1, 1)), 'day'), ...props }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;overflow-x:auto;">
        <div style="position:relative;width:3000px;height:36px;background:#f0f0f0;border-radius:6px;">
          <ProjectBar
            :timeline="timeline"
            :startDate="startDate"
            :endDate="endDate"
            :projectCode="projectCode"
            :color="color"
            :opacity="opacity"
          />
        </div>
      </div>
    `,
  })
}

// Date variants in the first quarter
const d = {
  full: { startDate: iso(day(1, 1)), endDate: iso(day(3, 31)) },
  mid: { startDate: iso(day(1, 12)), endDate: iso(day(3, 10)) },
  short: { startDate: iso(day(1, 20)), endDate: iso(day(2, 14)) },
  late: { startDate: iso(day(3, 20)), endDate: iso(day(3, 31)) },
}

export const Default: Story = { render: withProject({ ...d.mid, projectCode: 'PRJ-001' }) }
export const FullPeriod: Story = { render: withProject({ ...d.full, projectCode: 'PRJ-002' }) }
export const ShortProject: Story = { render: withProject({ ...d.short, projectCode: 'PRJ-003' }) }
export const LateStart: Story = { render: withProject({ ...d.late, projectCode: 'PRJ-004' }) }
export const CustomColor: Story = { render: withProject({ ...d.mid, projectCode: 'PRJ-005', color: '#ea4335' }) }
export const CustomOpacity: Story = { render: withProject({ ...d.mid, projectCode: 'PRJ-006', color: '#1a73e8', opacity: 0.4 }) }
