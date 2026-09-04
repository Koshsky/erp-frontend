import type { Meta, StoryObj } from '@storybook/vue3-vite'
import PasswordDialog from './PasswordDialog.vue'

const meta: Meta<typeof PasswordDialog> = {
  title: 'Components/Common/PasswordDialog',
  component: PasswordDialog,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    open: { control: 'boolean' },
    password: { control: 'text' },
    caption: { control: 'text' },
  },
  args: {
    open: true,
    caption: 'Пользователь «Иван Петров» создан',
    password: 'R9x3AXmMNLX3Fk8K',
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const GeneratedPassword: Story = {}

export const ResetPassword: Story = {
  args: {
    caption: 'Новый пароль для «Иван Петров»',
    password: 'k7Vp2qLmZx9R',
  },
}

export const LongPassword: Story = {
  args: {
    caption: 'Новый пароль для «Александр Смирнов»',
    password: 'aB3dE7fGh9iJkLmN0pQrStUvWxYz123456',
  },
}