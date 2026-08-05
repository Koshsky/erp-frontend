import type { ArgTypes } from '@storybook/vue3-vite'
import type { GanttBarProps } from './types'

export const ganttBarArgTypes: ArgTypes<GanttBarProps> = {
  timeline: { control: false, table: { disable: true, category: 'Data' } },
  startDate: {
    name: 'Дата начала',
    description: 'Дата начала задачи',
    control: 'date',
    table: {
      type: { summary: 'string | Date | number' },
      category: 'Data',
    },
  },
  endDate: {
    name: 'Дата окончания',
    description: 'Дата окончания задачи',
    control: 'date',
    table: {
      type: { summary: 'string | Date | number' },
      category: 'Data',
    },
  },
  groupStartDate: {
    name: 'Начало границ родителя',
    description: 'Дата начала границ родителя (процесса/проекта); бар не перетаскивается левее',
    control: 'date',
    table: {
      type: { summary: 'string | Date | number | null' },
      category: 'Data',
    },
  },
  groupEndDate: {
    name: 'Окончание границ родителя',
    description: 'Дата окончания границ родителя (процесса/проекта); бар не перетаскивается правее',
    control: 'date',
    table: {
      type: { summary: 'string | Date | number | null' },
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
