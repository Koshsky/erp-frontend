import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ResourceHeader from './ResourceHeader.vue'
import { cellCount } from '../../../calendar'

const now = new Date()
const y = now.getFullYear()
const day = (d: number) => new Date(y, now.getMonth(), d)

const resources = [
  { id: 1, code: 'ПТО', title: 'Инженер ПТО', quantity: 4 },
  { id: 2, code: 'МК', title: 'Монтажник', quantity: 4 },
  { id: 3, code: 'РП', title: 'Руководитель проекта', quantity: 1 },
  { id: 4, code: 'РПИ', title: 'РПИ', quantity: 1 },
  { id: 5, code: 'СВ', title: 'Сварщик', quantity: 2 },
]

const meta: Meta<typeof ResourceHeader> = {
  title: 'Components/Planner/ResourceHeader',
  component: ResourceHeader,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

const cellDates = (cells: number) => Array.from({ length: cells }, (_, i) => day(i + 1))

function renderWith(usageMap: Record<number, number[]>, unit: 'day' | 'decade' = 'day') {
  const anchor = day(1)
  const cells = cellCount(anchor, 'quarter', unit)
  return () => ({
    components: { ResourceHeader },
    data: () => ({
      anchor,
      mode: 'quarter' as const,
      unit,
      cells,
      resources,
      usageFn: (rid: number, d: Date) => {
        const dates = cellDates(cellCount(anchor, 'quarter', 'day'))
        const idx = dates.findIndex(x => x.getTime() === d.getTime())
        return idx >= 0 ? (usageMap[rid]?.[idx] || 0) : 0
      },
    }),
    template: `
      <div :style="{ display: 'grid', gridTemplateColumns: '180px repeat(' + cells + ', var(--cell-width, 32px))', background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
        <ResourceHeader :anchor="anchor" :mode="mode" :unit="unit" :resources="resources" :usageFn="usageFn" />
      </div>
    `,
  })
}

// Равномерная загрузка — все ресурсы задействованы примерно на 50-100%
export const BalancedLoad: Story = {
  render: renderWith({
    1: [1,2,2,2,2,1,1,2,2,2,1,1,2,1,1,1,0,2,1,1],
    2: [2,2,1,3,3,2,2,3,3,3,3,2,3,2,2,1,2,3,2,2],
    3: [0,1,1,1,0,0,1,1,0,0,1,1,1,0,0,1,0,1,0,0],
    4: [1,0,0,1,1,1,0,0,1,1,1,0,1,1,0,0,1,0,1,1],
    5: [1,1,0,1,1,0,0,1,1,0,0,1,0,1,1,1,0,0,1,0],
  }),
}

// Тяжёлая загрузка — ресурсы задействованы на пределе, местами перегруз (used > total).
// Нормативы: ПТО=4, МК=4, РП=1, РПИ=1, СВ=2.
// Значения 5, 2, 3 и т.п. выше норматива дают красные ячейки "перегруз".
export const HeavyLoad: Story = {
  render: renderWith({
    1: [4,5,4,4,5,4,4,4,4,5,4,4,4,4,4,5,4,4,4,4],
    2: [4,4,5,4,4,4,5,4,4,4,4,4,4,5,4,3,4,4,4,4],
    3: [1,1,2,1,1,1,1,1,1,2,1,1,1,1,1,1,1,2,1,1],
    4: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    5: [2,2,3,2,2,2,2,2,3,2,2,2,2,2,2,3,2,2,2,2],
  }),
}

export const Underloaded: Story = {
  render: renderWith({
    1: [0,1,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1,0,0],
    2: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
    3: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    4: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    5: [0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0],
  }),
}

/** Декады: пик дневной загрузки внутри каждой ячейки (10 дней) */
export const DecadeCells: Story = {
  render: renderWith(
    {
      1: [1,2,2,2,2,1,1,2,2,2,1,1,2,1,1,1,0,2,1,1],
      2: [2,2,1,3,3,2,2,3,3,3,3,2,3,2,2,1,2,3,2,2],
      3: [0,1,1,1,0,0,1,1,0,0,1,1,1,0,0,1,0,1,0,0],
      4: [1,0,0,1,1,1,0,0,1,1,1,0,1,1,0,0,1,0,1,1],
      5: [1,1,0,1,1,0,0,1,1,0,0,1,0,1,1,1,0,0,1,0],
    },
    'decade',
  ),
}
