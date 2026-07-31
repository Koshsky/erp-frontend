import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProcessBar from './ProcessBar.vue'

const now = new Date()
const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

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
    data: () => ({ dayZero: day(1), totalDays: 60, ...props }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;height:36px;background:#f0f0f0;border-radius:6px;">
          <ProcessBar
            :dayZero="dayZero"
            :totalDays="totalDays"
            :startDate="startDate"
            :endDate="endDate"
            :title="title"
            :projectCode="projectCode"
            :color="color"
            :opacity="opacity"
          />
        </div>
      </div>
    `,
  })
}

// Вспомогательные фиксированные варианты дат
const d = {
  p1s: iso(day(2)),  p1e: iso(day(38)),
  p2s: iso(day(12)), p2e: iso(day(50)),
  p3s: iso(day(20)), p3e: iso(day(45)),
}
export const Default: Story = {
  render: withProcess({ startDate: d.p1s, endDate: d.p1e, title: 'Инсталляция', projectCode: 'KO-1001' }),
}

export const DangerColor: Story = {
  render: withProcess({ startDate: d.p2s, endDate: d.p2e, title: 'Производство', projectCode: 'KO-1002', color: '#ea4335' }),
}

export const EvenSpan: Story = {
  render: withProcess({ startDate: d.p3s, endDate: d.p3e, title: 'Закупка', projectCode: 'KO-1003', color: '#34a853' }),
}

