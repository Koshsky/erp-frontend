import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CalendarHeader from './CalendarHeader.vue'
import { cellCount } from '../calendar'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)

const meta: Meta<typeof CalendarHeader> = {
  title: 'Components/Planner/CalendarHeader',
  component: CalendarHeader,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

// Отрисовка в контейнере c фикс. левой колонкой
const wrap = `
  <div :style="{ display:'grid', gridTemplateColumns:'180px repeat(' + cells + ', var(--cell-width, 32px))', background:'#fff', borderRadius:'10px', padding:'12px', boxShadow:'0 1px 6px rgba(0,0,0,.08)', overflow:'auto', minWidth:'600px' }">
    <CalendarHeader :anchor="anchor" :mode="mode" :unit="unit" />
  </div>
`

function rangeStory(mode: 'quarter' | 'half' | 'year', unit: 'day' | 'decade'): Story['render'] {
  const anchor = day(1, 1)
  const cells = cellCount(anchor, mode, unit)
  return () => ({
    components: { CalendarHeader },
    data: () => ({
      anchor,
      mode,
      unit,
      cells,
    }),
    template: wrap,
  })
}

export const QuarterDays: Story = { render: rangeStory('quarter', 'day') }
export const QuarterDecades: Story = { render: rangeStory('quarter', 'decade') }
export const HalfYearDays: Story = { render: rangeStory('half', 'day') }
export const FullYearDays: Story = { render: rangeStory('year', 'day') }

/** Год с декадами — основной сценарий для годового планирования (34 колонки) */
export const FullYearDecades: Story = { render: rangeStory('year', 'decade') }

/** Якорь в середине года — месяцы не совпадают с календарным годом */
export const MidYearAnchor: Story = {
  render: () => ({
    components: { CalendarHeader },
    data: () => ({ anchor: day(7, 15), mode: 'year' as const, unit: 'decade' as const, cells: cellCount(day(7, 15), 'year', 'decade') }),
    template: wrap,
  }),
}

/** Полгода с anchor посреди месяца — первая декада частичная («15-20»), подписи-диапазоны */
export const MidMonthAnchor: Story = {
  render: () => ({
    components: { CalendarHeader },
    data: () => {
      const anchor = day(4, 15)
      return { anchor, mode: 'half' as const, unit: 'decade' as const, cells: cellCount(anchor, 'half', 'decade') }
    },
    template: wrap,
  }),
}
