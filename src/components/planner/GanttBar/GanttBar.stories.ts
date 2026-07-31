import type { Meta, StoryObj } from '@storybook/vue3-vite'
import GanttBar from './GanttBar.vue'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const meta: Meta<typeof GanttBar> = {
  title: 'Components/Planner/GanttBar',
  component: GanttBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

/**
 * Все вариации GanttBar на одной странице.
 * Полоса 30 дней, бары показывают разную длину, цвет, прозрачность и содержимое.
 */
export const AllVariants: Story = {
  render: () => ({
    components: { GanttBar },
    data() {
      return {
        dayZero: day(1, 1),
        totalDays: 30,
        iso,
        day,
      }
    },
    computed: {
      trackStyle() {
        return {
          position: 'relative',
          width: '100%',
          height: '36px',
          background: '#f0f0f0',
          borderRadius: '6px',
        }
      },
      labelStyle() {
        return {
          fontSize: '11px',
          fontWeight: 600,
          color: '#444',
        }
      },
    },
    template: `
      <div style="max-width:720px;margin:0 auto;font-family:sans-serif;display:flex;flex-direction:column;gap:18px;">

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">По умолчанию (зелёный, короткая)</div>
          <div :style="trackStyle">
            <GanttBar :dayZero="dayZero" :totalDays="totalDays" :startDate="iso(day(1,4))" :endDate="iso(day(1,9))" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Синий цвет, средняя длина</div>
          <div :style="trackStyle">
            <GanttBar :dayZero="dayZero" :totalDays="totalDays" :startDate="iso(day(1,3))" :endDate="iso(day(1,18))" color="#1a73e8" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Жёлтый (warning), почти весь период</div>
          <div :style="trackStyle">
            <GanttBar :dayZero="dayZero" :totalDays="totalDays" :startDate="iso(day(1,2))" :endDate="iso(day(1,28))" color="#fbbc04" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Красный (alert), короткая полоса в конце</div>
          <div :style="trackStyle">
            <GanttBar :dayZero="dayZero" :totalDays="totalDays" :startDate="iso(day(1,20))" :endDate="iso(day(1,26))" color="#ea4335" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Полупрозрачный (opacity 0.4)</div>
          <div :style="trackStyle">
            <GanttBar :dayZero="dayZero" :totalDays="totalDays" :startDate="iso(day(1,8))" :endDate="iso(day(1,22))" color="#34a853" :opacity="0.4" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">С содержимым (слот)</div>
          <div :style="trackStyle">
            <GanttBar :dayZero="dayZero" :totalDays="totalDays" :startDate="iso(day(1,6))" :endDate="iso(day(1,24))">
              <span :style="labelStyle">24 дня · 2 ресурса</span>
            </GanttBar>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Плотная группа (фрагменты, один период)</div>
          <div :style="trackStyle">
            <GanttBar :dayZero="dayZero" :totalDays="totalDays" :startDate="iso(day(1,12))" :endDate="iso(day(1,16))" color="#188038" />
            <GanttBar :dayZero="dayZero" :totalDays="totalDays" :startDate="iso(day(1,18))" :endDate="iso(day(1,27))" color="#188038" />
          </div>
        </div>

      </div>
    `,
  }),
}

