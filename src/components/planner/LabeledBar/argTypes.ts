import type { ArgTypes } from '@storybook/vue3-vite'
import type { LabeledBarProps } from './types'

export const labeledBarArgTypes: ArgTypes<LabeledBarProps> = {
  timeline: {
    name: 'Шкала',
    description: 'Контекст бесконечной шкалы',
    table: { type: { summary: 'TimelineCtx' }, category: 'Data' },
  },
  startDate: {
    name: 'Начало',
    description: 'Дата начала бара',
    table: { type: { summary: 'string | Date | number' }, category: 'Data' },
  },
  endDate: {
    name: 'Конец',
    description: 'Дата окончания бара',
    table: { type: { summary: 'string | Date | number' }, category: 'Data' },
  },
  title: {
    name: 'Название',
    description: 'Текст бара (по умолчанию — контент слота)',
    control: 'text',
    table: { type: { summary: 'string' }, category: 'Content' },
  },
  projectCode: {
    name: 'Код проекта',
    description: 'Бейдж после названия',
    control: 'text',
    table: { type: { summary: 'string' }, category: 'Content' },
  },
  color: {
    name: 'Цвет',
    control: 'color',
    table: {
      type: { summary: 'string' },
      defaultValue: { summary: '#34a853' },
      category: 'Style',
    },
  },
  opacity: {
    name: 'Прозрачность',
    control: 'number',
    table: {
      type: { summary: 'number' },
      defaultValue: { summary: '0.75' },
      category: 'Style',
    },
  },
  height: {
    name: 'Высота',
    control: 'number',
    table: { type: { summary: 'number' }, defaultValue: { summary: '24' }, category: 'Style' },
  },
  top: {
    name: 'Отступ сверху',
    control: 'number',
    table: { type: { summary: 'number' }, defaultValue: { summary: '1' }, category: 'Style' },
  },
  draggable: {
    name: 'Перетаскивание',
    control: 'boolean',
    table: {
      type: { summary: 'boolean' },
      defaultValue: { summary: 'true' },
      category: 'Behavior',
    },
  },
}

export default labeledBarArgTypes
