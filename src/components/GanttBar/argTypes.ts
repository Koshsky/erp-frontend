import type { ArgTypes } from '@storybook/vue3-vite'
import type { GanttBarProps } from './types'

export const ganttBarArgTypes: ArgTypes<GanttBarProps> = {
  dayZero: {
    name: 'Начало шкалы',
    description: 'Опорная дата (нулевой день) для расчёта смещения',
    control: 'date',
    table: {
      type: { summary: 'Date' },
      category: 'Data',
    },
  },
  totalDays: {
    name: 'Всего дней',
    description: 'Общее количество дней на шкале',
    control: { type: 'number', min: 1, max: 365 },
    table: {
      type: { summary: 'number' },
      defaultValue: { summary: '30' },
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
