import type { Meta, StoryObj } from '@storybook/vue3-vite'
import UsageCell from './UsageCell.vue'

const meta: Meta<typeof UsageCell> = {
  title: 'Components/Planner/UsageCell',
  component: UsageCell,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

// Все состояния UsageCell на одной странице с подписями
export const AllStates: Story = {
  render: () => ({
    components: { UsageCell },
    template: `
      <div style="font-family:sans-serif;">
        <div style="display:grid;grid-template-columns:repeat(4, 150px);gap:24px;align-items:start;">

          <div style="display:flex;flex-direction:column;gap:8px;align-items:center;">
            <div style="font-size:13px;font-weight:600;color:#444;">Under Used</div>
            <div style="font-size:11px;color:#999;">2 / 4 — недобор</div>
            <div style="width:110px;"><UsageCell :used="2" :available="4" /></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;align-items:center;">
            <div style="font-size:13px;font-weight:600;color:#444;">Full Used</div>
            <div style="font-size:11px;color:#999;">4 / 4 — идеально</div>
            <div style="width:110px;"><UsageCell :used="4" :available="4" /></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;align-items:center;">
            <div style="font-size:13px;font-weight:600;color:#444;">Over Used</div>
            <div style="font-size:11px;color:#999;">5 / 4 — перебор</div>
            <div style="width:110px;"><UsageCell :used="5" :available="4" /></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;align-items:center;">
            <div style="font-size:13px;font-weight:600;color:#444;">Weekend</div>
            <div style="font-size:11px;color:#999;">выходной день</div>
            <div style="width:110px;"><UsageCell :used="0" :available="4" :is-weekend="true" /></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;align-items:center;">
            <div style="font-size:13px;font-weight:600;color:#444;">Unknown</div>
            <div style="font-size:11px;color:#999;">нет данных о доступности</div>
            <div style="width:110px;"><UsageCell :used="2" /></div>
          </div>

        </div>
      </div>
    `,
  }),
}

