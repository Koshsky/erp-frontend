import { ref, computed, watch } from 'vue'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TaskBar from './TaskBar.vue'

const now = new Date()
const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const meta: Meta<typeof TaskBar> = {
  title: 'Components/Gantt/TaskBar',
  component: TaskBar,
  parameters: { layout: 'padded' },
  render: () => ({
    components: { TaskBar },
    setup() {
      const dayZero = ref(day(1))
      const totalDays = ref(30)
      const startDay = ref(5)
      const endDay = ref(12)
      const res1Qty = ref(2)
      const res1Code = ref('И')
      const res2Qty = ref(1)
      const res2Code = ref('ПР')

      watch(startDay, (val) => {
        if (val >= endDay.value) endDay.value = val + 1
      })
      watch(endDay, (val) => {
        if (val <= startDay.value) startDay.value = val - 1
      })

      const safeStartDay = computed(() => Math.max(1, Math.min(startDay.value, endDay.value - 1)))
      const safeEndDay = computed(() => Math.min(totalDays.value, Math.max(endDay.value, startDay.value + 1)))

      const task = computed(() => ({
        id: 1,
        title: 'Осмотр объекта',
        start_date: iso(day(safeStartDay.value)),
        end_date: iso(day(safeEndDay.value)),
        resources: [
          { resource_id: 1, quantity: Math.max(0, Number(res1Qty.value)), code: res1Code.value },
          { resource_id: 3, quantity: Math.max(0, Number(res2Qty.value)), code: res2Code.value },
        ],
      }))

      return { dayZero, totalDays, task, startDay, endDay, res1Qty, res1Code, res2Qty, res2Code }
    },
    template: `
      <div style="max-width:700px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;height:40px;background:#f0f0f0;border-radius:6px;margin-bottom:24px;">
          <TaskBar :dayZero="dayZero" :totalDays="totalDays" :task="task" />
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
            Ресурс 1: кол-во
            <input type="range" v-model.number="res1Qty" :min="0" :max="5" style="width:100%;">
            <span style="font-weight:400;color:#666;">{{ res1Qty }}×</span>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Ресурс 1: код
            <input type="text" v-model="res1Code" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:4px;">
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Ресурс 2: кол-во
            <input type="range" v-model.number="res2Qty" :min="0" :max="5" style="width:100%;">
            <span style="font-weight:400;color:#666;">{{ res2Qty }}×</span>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Ресурс 2: код
            <input type="text" v-model="res2Code" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:4px;">
          </label>
        </div>
      </div>
    `,
  }),
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
