import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ContextMenu from './ContextMenu.vue'

const meta: Meta<typeof ContextMenu> = {
  title: 'Components/Common/ContextMenu',
  component: ContextMenu,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

const items = [
  { id: 'task', label: 'Создать задачу' },
  { id: 'milestone', label: 'Создать веху' },
]

export const Open: Story = {
  args: {
    open: true,
    x: 120,
    y: 80,
    items,
  },
}

export const NearRightEdge: Story = {
  args: {
    open: true,
    x: window.innerWidth - 40,
    y: 60,
    items,
  },
}

export const SingleItem: Story = {
  args: {
    open: true,
    x: 100,
    y: 100,
    items: [{ id: 'project', label: 'Создать проект' }],
  },
}
