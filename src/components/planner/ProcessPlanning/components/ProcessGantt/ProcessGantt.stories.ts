import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProcessGantt from './ProcessGantt.vue'
import { cellCount } from '../../../calendar'

const now = new Date()
const day = (m: number) => new Date(now.getFullYear(), now.getMonth(), m)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const meta: Meta<typeof ProcessGantt> = {
  title: 'Components/Planner/ProcessGantt',
  component: ProcessGantt,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

const anchor = day(1)
const cells = cellCount(anchor, 'quarter', 'day')

const twoProcesses = [
  { id: 1, title: 'Производство', start_date: iso(day(3)), end_date: iso(day(36)) },
  { id: 2, title: 'Инсталляция', start_date: iso(day(20)), end_date: iso(day(56)) },
]

const overlapping = [
  { id: 1, title: 'Производство', start_date: iso(day(1)), end_date: iso(day(40)) },
  { id: 2, title: 'Инсталляция', start_date: iso(day(30)), end_date: iso(day(60)) },
  { id: 3, title: 'Пусконаладка', start_date: iso(day(50)), end_date: iso(day(61)) },
]
export const TwoProcesses: Story = {
  render: () => ({
    components: { ProcessGantt },
    data: () => ({ anchor, cells, projectCode: 'КО-1234', processes: twoProcesses, mode: 'quarter' as const, unit: 'day' as const }),
    template: `
      <div :style="{ display: 'grid', gridTemplateColumns: '180px repeat(' + cells + ', 1fr)', background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
        <ProcessGantt :anchor="anchor" :mode="mode" :unit="unit" :projectCode="projectCode" :processes="processes" />
      </div>
    `,
  }),
}

export const Overlapping: Story = {
  render: () => ({
    components: { ProcessGantt },
    data: () => ({ anchor, cells, projectCode: 'КО-9999', processes: overlapping, mode: 'quarter' as const, unit: 'day' as const }),
    template: `
      <div :style="{ display: 'grid', gridTemplateColumns: '180px repeat(' + cells + ', 1fr)', background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
        <ProcessGantt :anchor="anchor" :mode="mode" :unit="unit" :projectCode="projectCode" :processes="processes" />
      </div>
    `,
  }),
}
