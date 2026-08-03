import type { ArgTypes } from '@storybook/vue3-vite'
import type { GanttBarProps } from './types'

export const ganttBarArgTypes: ArgTypes<GanttBarProps> = {
  anchor: {
    name: 'Якорь шкалы',
    description: 'Опорная дата (первая ячейка) для расчёта смещения',
    control: 'date',
    table: {
      type: { summary: 'Date' },
      category: 'Data',
    },
  },
  mode: {
    name: 'Период',
    description: 'Период календаря: квартал (92 дня), полугодие или год',
    control: 'select',
    options: ['quarter', 'half', 'year'],
    table: {
      type: { summary: 'PlanningMode' },
      defaultValue: { summary: 'quarter' },
      category: 'Data',
    },
  },
  unit: {
    name: 'Единица ячейки',
    description: 'Сколько дней в одной ячейке шкалы: день, неделя или декада',
    control: 'select',
    options: ['day', 'decade'],
    table: {
      type: { summary: 'PlanningUnit' },
      defaultValue: { summary: 'day' },
      category: 'Data',
    },
  },
  startDate: {
    name: 'Дата начала',
    description: 'Дата начала задачи',
    control: 'date',
    table: {
      type: { summary: 'string | Date' },
      category: 'Data',
    },
  },
  endDate: {
    name: 'Дата окончания',
    description: 'Дата окончания задачи',
    control: 'date',
    table: {
      type: { summary: 'string | Date' },
      category: 'Data',
    },
  },
  color: {
    name: 'Цвет',
    description: 'Цвет заливки бара',
    control: 'color',
    table: {
      type: { summary: 'string' },
      defaultValue: { summary: '#34a853' },
      category: 'Appearance',
    },
  },
  opacity: {
    name: 'Прозрачность',
    description: 'Прозрачность заливки (0–1)',
    control: { type: 'range', min: 0, max: 1, step: 0.05 },
    table: {
      type: { summary: 'number' },
      defaultValue: { summary: '0.75' },
      category: 'Appearance',
    },
  },
}

export default ganttBarArgTypes
