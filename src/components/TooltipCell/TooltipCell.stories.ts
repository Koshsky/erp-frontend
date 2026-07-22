import { ref } from 'vue'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TooltipCell from './TooltipCell.vue'

const meta: Meta<typeof TooltipCell> = {
  title: 'Components/TooltipCell',
  component: TooltipCell,
  parameters: { layout: 'centered' },
  render: () => ({
    components: { TooltipCell },
    setup() {
      const text = ref('Это подсказка. Наведи курсор!')
      return { text }
    },
    template: `
      <div style="max-width:500px;font-family:sans-serif;">
        <div style="padding:40px;text-align:center;">
          <TooltipCell :text="text">
            <span style="font-size:14px;border-bottom:1px dashed #999">Наведи сюда курсор</span>
          </TooltipCell>
        </div>

        <div style="background:#f8f9fa;padding:16px;border-radius:8px;border:1px solid #e8e8e8;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#444;">
            Текст подсказки
            <input type="text" v-model="text" style="width:100%;padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:14px;">
          </label>
        </div>
      </div>
    `,
  }),
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
