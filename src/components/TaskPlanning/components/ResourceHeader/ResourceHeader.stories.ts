import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ResourceHeader from './ResourceHeader.vue'

const now = new Date()
const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d)

const dayList = Array.from({ length: 20 }, (_, i) => day(i + 1))

const resources = [
  { id: 1, code: 'ПТО', title: 'Инженер ПТО', quantity: 4 },
  { id: 2, code: 'МК', title: 'Монтажник', quantity: 4 },
  { id: 3, code: 'РП', title: 'Руководитель проекта', quantity: 1 },
  { id: 4, code: 'РПИ', title: 'РПИ', quantity: 1 },
  { id: 5, code: 'СВ', title: 'Сварщик', quantity: 2 },
]

const usageMap: Record<number, number[]> = {
  1: [0,0,2,2,2,1,0,0,0,1,1,1,0,0,0,0,0,0,0,0],
  2: [0,0,0,0,0,0,0,3,3,3,3,3,3,0,0,0,0,0,0,0],
  3: [0,0,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0],
  4: [0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0],
  5: [0,0,0,0,1,0,0,0,0,0,0,0,0,2,2,2,0,0,0,0],
}

const meta: Meta<typeof ResourceHeader> = {
  title: 'Components/Gantt/ResourceHeader',
  component: ResourceHeader,
  parameters: { layout: 'padded' },
  args: {
    dayList,
    resources,
    usageFn: (rid: number, d: Date) => {
      const idx = dayList.findIndex(x => x.getTime() === d.getTime())
      return idx >= 0 ? (usageMap[rid]?.[idx] || 0) : 0
    },
  },
  render: (args: Record<string, any>) => ({
    components: { ResourceHeader },
    setup() {
      const cols = `180px repeat(${args.dayList.length}, 1fr)`
      return { args, cols }
    },
    template: `
      <div :style="{ display: 'grid', gridTemplateColumns: cols, background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
        <ResourceHeader :dayList="args.dayList" :resources="args.resources" :usageFn="args.usageFn" />
      </div>
    `,
  }),
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
