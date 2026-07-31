import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CalendarHeader from './CalendarHeader.vue'

const now = new Date()

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
  <div style="display:grid;grid-template-columns:180px repeat({{days}}, 1fr);background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 6px rgba(0,0,0,.08);overflow:auto;min-width:600px;">
    <CalendarHeader :startDate="startDate" :endDate="endDate" />
  </div>
`

function rangeStory(days: number): Story['render'] {
  return () => ({
    components: { CalendarHeader },
    data: () => ({
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: (() => { const d = new Date(now.getFullYear(), now.getMonth(), 1); d.setDate(d.getDate() + days - 1); return d })(),
      days,
    }),
    template: wrap,
  })
}

export const OneMonth: Story = { render: rangeStory(31) }
export const OneWeek: Story = { render: rangeStory(7) }
export const Quarter: Story = { render: rangeStory(92) }
export const CustomRange: Story = {
  render: () => ({
    components: { CalendarHeader },
    data: () => ({
      startDate: new Date(now.getFullYear(), now.getMonth() + 1, 10),
      endDate: new Date(now.getFullYear(), now.getMonth() + 3, 5),
      days: 62,
    }),
    template: wrap,
  }),
}

