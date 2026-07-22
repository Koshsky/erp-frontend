import { ref, computed, watch } from 'vue'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import GanttBar from './GanttBar.vue'

const now = new Date()
const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const meta: Meta<typeof GanttBar> = {
  title: 'Components/Gantt/GanttBar',
  component: GanttBar,
  parameters: { layout: 'padded' },
  render: () => ({
    components: { GanttBar },
    setup() {
      const dayZero = ref(day(1))
      const totalDays = ref(30)
      const startDay = ref(5)
      const endDay = ref(12)
      const color = ref('#1a73e8')
      const opacity = ref(0.6)

      watch(startDay, (val) => {
        if (val >= endDay.value) endDay.value = val + 1
      })
      watch(endDay, (val) => {
        if (val <= startDay.value) startDay.value = val - 1
      })

      const safeStartDay = computed(() => Math.max(1, Math.min(startDay.value, endDay.value - 1)))
      const safeEndDay = computed(() => Math.min(totalDays.value, Math.max(endDay.value, startDay.value + 1)))

      const startDate = computed(() => iso(day(safeStartDay.value)))
      const endDate = computed(() => iso(day(safeEndDay.value)))
      const label = computed(() => `${safeEndDay.value - safeStartDay.value + 1} дней`)

      return { dayZero, totalDays, startDate, endDate, color, opacity, startDay, endDay, label }
    },
    template: `
      <div style="max-width:700px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;height:40px;background:#f0f0f0;border-radius:6px;margin-bottom:24px;">
          <GanttBar :dayZero="dayZero" :totalDays="totalDays" :startDate="startDate" :endDate="endDate" :color="color" :opacity="opacity">
            <span style="font-size:11px;font-weight:600;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.3);pointer-events:none;white-space:nowrap">{{ label }}</span>
          </GanttBar>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8f9fa;padding:16px;border-radius:8px;border:1px solid #e8e8e8;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            День начала
            <input type="range" v-model.number="startDay" :min="1" :max="totalDays-1" style="width:100%;">
            <span style="font-weight:400;color:#666;">{{ startDay }}</span>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            День окончания
            <input type="range" v-model.number="endDay" :min="2" :max="totalDays" style="width:100%;">
            <span style="font-weight:400;color:#666;">{{ endDay }}</span>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Цвет
            <input type="color" v-model="color" style="width:100%;height:30px;border:none;border-radius:4px;">
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Прозрачность
            <input type="range" v-model.number="opacity" :min="0" :max="1" :step="0.05" style="width:100%;">
            <span style="font-weight:400;color:#666;">{{ opacity.toFixed(2) }}</span>
          </label>
        </div>
      </div>
    `,
  }),
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
