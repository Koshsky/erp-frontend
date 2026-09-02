import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AppIcon from './AppIcon.vue'
import { APP_ICONS } from './types'

const meta: Meta<typeof AppIcon> = {
  title: 'Components/Common/AppIcon',
  component: AppIcon,
  tags: ['autodocs'],
  args: { size: 20 },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { name: 'menu' },
}

/** Every icon of the set on a neutral grid — used to review the icon family. */
export const AllIcons: Story = {
  render: () => ({
    components: { AppIcon },
    setup() {
      return { names: Object.keys(APP_ICONS) }
    },
    template: `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:14px;padding:8px;">
        <div v-for="n in names" :key="n"
             style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 4px;border:1px solid var(--border);border-radius:8px;">
          <AppIcon :name="n as any" :size="20" />
          <span style="font-size:11px;color:var(--muted-foreground);">{{ n }}</span>
        </div>
      </div>
    `,
  }),
}