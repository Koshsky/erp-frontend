import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ModalForm from './ModalForm.vue'
import type { ModalField } from './types'

const meta: Meta<typeof ModalForm> = {
  title: 'Components/Common/ModalForm',
  component: ModalForm,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    open: true,
    title: 'Редактировать проект',
    submitLabel: 'Сохранить',
    busy: false,
    error: null,
  },
}

export default meta
type Story = StoryObj<typeof meta>

const textField = (key: string, label: string, value: string, required = true): ModalField => ({
  key,
  label,
  type: 'text',
  value,
  required,
})

export const SimpleText: Story = {
  args: {
    fields: [
      textField('code', 'Код проекта', 'КО_505-S-ПТЗ_БСМП_МВС'),
    ],
  },
}

export const WithSelect: Story = {
  args: {
    fields: [
      textField('code', 'Код проекта', 'КО_505-S-ПТЗ_БСМП_МВС'),
      {
        key: 'owner_id',
        label: 'Владелец',
        type: 'select',
        value: 2,
        options: [
          { value: 1, label: 'Иванов Иван' },
          { value: 2, label: 'Петров Пётр' },
          { value: 3, label: 'Сидорова Анна' },
        ],
      },
    ],
  },
}

export const WithTextarea: Story = {
  args: {
    title: 'Редактировать веху',
    fields: [
      textField('title', 'Название', 'Сдача объекта'),
      {
        key: 'content',
        label: 'Контент',
        type: 'textarea',
        value: 'Подписание акта ввода в эксплуатацию.',
      },
    ],
  },
}

export const Busy: Story = {
  args: {
    busy: true,
    fields: [textField('title', 'Название', 'Новый процесс')],
  },
}

export const WithError: Story = {
  args: {
    error: 'Не удалось сохранить: сервер недоступен',
    fields: [textField('title', 'Название', 'Новый процесс')],
  },
}
