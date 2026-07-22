import { ref } from 'vue'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import UsageCell from './UsageCell.vue'

const meta: Meta<typeof UsageCell> = {
  title: 'Components/Gantt/UsageCell',
  component: UsageCell,
  parameters: { layout: 'centered' },
  render: () => ({
    components: { UsageCell },
    setup() {
      const used = ref(2)
      const total = ref(4)
      const isWeekend = ref(false)

      return { used, total, isWeekend }
    },
    template: `
      <div style="max-width:300px;font-family:sans-serif;">
        <div style="width:80px;margin:0 auto 24px;">
          <UsageCell :used="used" :total="total" :isWeekend="isWeekend" />
        </div>

        <div style="display:grid;grid-template-columns:1fr;gap:12px;background:#f8f9fa;padding:16px;border-radius:8px;border:1px solid #e8e8e8;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Занято
            <input type="range" v-model.number="used" :min="0" :max="total + 3" style="width:100%;">
            <span style="font-weight:400;color:#666;">{{ used }}</span>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Всего
            <input type="range" v-model.number="total" :min="1" :max="10" style="width:100%;">
            <span style="font-weight:400;color:#666;">{{ total }}</span>
          </label>

          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#444;">
            <input type="checkbox" v-model="isWeekend">
            Выходной день
          </label>
        </div>
      </div>
    `,
  }),
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
