import { ref, computed } from 'vue'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CalendarHeader from './CalendarHeader.vue'

const now = new Date()

const meta: Meta<typeof CalendarHeader> = {
  title: 'Components/Gantt/CalendarHeader',
  component: CalendarHeader,
  parameters: { layout: 'padded' },
  render: () => ({
    components: { CalendarHeader },
    setup() {
      const dayCount = ref(31)
      const startDate = ref(new Date(now.getFullYear(), now.getMonth(), 1))
      const endDate = computed(() => {
        const d = new Date(startDate.value)
        d.setDate(d.getDate() + dayCount.value - 1)
        return d
      })

      return { startDate, endDate, dayCount }
    },
    template: `
      <div style="max-width:100%;font-family:sans-serif;">
        <div :style="{ display: 'grid', gridTemplateColumns: '180px repeat(' + dayCount + ', 1fr)', background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
          <CalendarHeader :startDate="startDate" :endDate="endDate" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;background:#f8f9fa;padding:16px;border-radius:8px;border:1px solid #e8e8e8;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Количество дней
            <input type="range" v-model.number="dayCount" :min="7" :max="365" style="width:100%;">
            <span style="font-weight:400;color:#666;">{{ dayCount }} дн.</span>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Дата начала
            <input type="date" :value="startDate.toISOString().slice(0,10)" @input="startDate = new Date($event.target.value)" style="width:100%;padding:4px 8px;border:1px solid #ccc;border-radius:4px;">
          </label>
        </div>
      </div>
    `,
  }),
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
