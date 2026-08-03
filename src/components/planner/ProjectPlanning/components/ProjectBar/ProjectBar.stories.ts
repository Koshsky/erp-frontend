import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProjectBar from './ProjectBar.vue'

const now = new Date()
const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

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
    data: () => ({ anchor: day(1), mode: 'quarter' as const, unit: 'day' as const, ...props }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;height:36px;background:#f0f0f0;border-radius:6px;">
          <ProjectBar
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
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

// Фиксированные варианты дат на квартальном периоде (92 дня)
const d = {
  full:   { startDate: iso(day(1)),  endDate: iso(day(91))  }, // весь период
  mid:    { startDate: iso(day(12)), endDate: iso(day(70))  },
  short:  { startDate: iso(day(20)), endDate: iso(day(45))  },
  late:   { startDate: iso(day(80)), endDate: iso(day(91))  },
}

export const Default: Story = {
  render: withProject({
    ...d.mid,
    projectCode: 'PRJ-001',
  }),
}

export const FullPeriod: Story = {
  render: withProject({
    ...d.full,
    projectCode: 'PRJ-002',
  }),
}

export const ShortProject: Story = {
  render: withProject({
    ...d.short,
    projectCode: 'PRJ-003',
  }),
}

export const LateStart: Story = {
  render: withProject({
    ...d.late,
    projectCode: 'PRJ-004',
  }),
}

export const CustomColor: Story = {
  render: withProject({
    ...d.mid,
    projectCode: 'PRJ-005',
    color: '#ea4335',
  }),
}

export const CustomOpacity: Story = {
  render: withProject({
    ...d.mid,
    projectCode: 'PRJ-006',
    color: '#1a73e8',
    opacity: 0.4,
  }),
}
