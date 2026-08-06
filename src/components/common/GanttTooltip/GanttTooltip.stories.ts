import type { Meta, StoryObj } from '@storybook/vue3-vite'
import GanttTooltip from './GanttTooltip.vue'

const meta: Meta<typeof GanttTooltip> = {
  title: 'Components/Common/GanttTooltip',
  component: GanttTooltip,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (story) => ({
      components: { story },
      template: `<div style="background:#2c2c2c;padding:6px 14px;border-radius:6px;display:inline-block"><story /></div>`,
    }),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

export const Simple: Story = {
  args: {
    title: 'Задача',
    rows: ['18.07.2026 — 07.08.2026'],
  },
}

export const WithOwner: Story = {
  args: {
    title: 'Инсталляция',
    rows: ['Владелец: Иванов', '01.08.2026 — 20.09.2026'],
  },
}

export const WithResources: Story = {
  args: {
    title: 'Монтаж конструкций',
    rows: ['01.08.2026 — 10.08.2026'],
    resources: [
      { label: 'Монтажник', quantity: 3 },
      { label: 'Инженер', quantity: 1 },
    ],
  },
}
