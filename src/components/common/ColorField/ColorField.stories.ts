import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ColorField from './ColorField.vue'

const meta: Meta<typeof ColorField> = {
  title: 'Components/Common/ColorField',
  component: ColorField,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    modelValue: {
      name: 'Цвет',
      description: 'Текущий цвет (#RRGGBB) или пустая строка — стандартный цвет',
      control: 'color',
    },
    label: {
      name: 'Подпись',
      description: 'Подпись поля (aria-label и заголовок панели)',
      control: 'text',
    },
    size: {
      name: 'Размер',
      description: 'Размер кружка-триггера и квадратиков палитры',
      control: { type: 'select' },
      options: ['sm', 'md'],
    },
  },
  args: {
    modelValue: '#3B82F6',
    label: 'Цвет проекта',
    size: 'md',
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithoutColor: Story = {
  args: {
    modelValue: '',
    label: 'Цвет (стандартный)',
    size: 'md',
  },
}

export const SmallInline: Story = {
  args: {
    modelValue: '#22C55E',
    label: 'Цвет',
    size: 'sm',
  },
}