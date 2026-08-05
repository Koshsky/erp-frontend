import type { Meta, StoryObj } from '@storybook/vue3-vite'
import GanttBar from './GanttBar.vue'
import { makeDemoTimeline } from '@/components/planner/plannerStoryHelpers'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const meta: Meta<typeof GanttBar> = {
  title: 'Components/Planner/GanttBar',
  component: GanttBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

const trackStyle = {
  position: 'relative',
  width: '3000px',
  height: '36px',
  background: '#f0f0f0',
  borderRadius: '6px',
  overflow: 'hidden',
} as const

export const AllVariants: Story = {
  render: () => ({
    components: { GanttBar },
    data: () => ({
      timeline: makeDemoTimeline(iso(day(1, 1)), 'day', { windowStart: -5 }),
      iso,
      day,
    }),
    template: `
      <div style="max-width:760px;margin:0 auto;font-family:sans-serif;display:flex;flex-direction:column;gap:18px;overflow-x:auto;">
        <div style="font-size:12px;color:#666;">Бесконечная шкала: бары позиционируются в px по абсолютным ячейкам от якоря 1 января.</div>

        <div>
          <div style="font-size:13px;font-weight:600;color:#666;margin-bottom:6px;">Короткий бар в начале</div>
          <div :style="trackStyle"><GanttBar :timeline="timeline" :startDate="iso(day(1,4))" :endDate="iso(day(1,9))" /></div>
        </div>

        <div>
          <div style="font-size:13px;font-weight:600;color:#666;margin-bottom:6px;">Бар через границу месяцев</div>
          <div :style="trackStyle"><GanttBar :timeline="timeline" :startDate="iso(day(1,20))" :endDate="iso(day(2,18))" color="#1a73e8" /></div>
        </div>

        <div>
          <div style="font-size:13px;font-weight:600;color:#666;margin-bottom:6px;">Длинный бар (почти квартал)</div>
          <div :style="trackStyle"><GanttBar :timeline="timeline" :startDate="iso(day(1,2))" :endDate="iso(day(3,25))" color="#fbbc04" /></div>
        </div>

        <div>
          <div style="font-size:13px;font-weight:600;color:#666;margin-bottom:6px;">С содержимым (слот)</div>
          <div :style="trackStyle">
            <GanttBar :timeline="timeline" :startDate="iso(day(1,6))" :endDate="iso(day(2,28))">
              <span style="font-size:11px;font-weight:600;color:#fff;">53 дня · 2 ресурса</span>
            </GanttBar>
          </div>
        </div>
      </div>
    `,
  }),
}
