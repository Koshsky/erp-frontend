import type { ArgTypes } from '@storybook/vue3-vite'
import type { ProcessBarProps } from './types'

export const processBarArgTypes: ArgTypes<ProcessBarProps> = {
  title: {
    name: 'Название процесса',
    control: 'text',
    table: { category: 'Content' },
  },
  projectCode: {
    name: 'Код проекта',
    control: 'text',
    table: { category: 'Content' },
  },
  dayZero: {
    name: 'Начало шкалы',
    control: 'date',
    table: { type: { summary: 'Date | number' }, category: 'Data' },
  },
  totalDays: {
    name: 'Всего дней',
    control: { type: 'number', min: 1, max: 365 },
    table: { category: 'Data' },
  },
  startDate: {
    name: 'Дата начала',
    control: 'date',
    table: { category: 'Data' },
  },
  endDate: {
    name: 'Дата окончания',
    control: 'date',
    table: { category: 'Data' },
  },
  color: {
    name: 'Цвет',
    control: 'color',
    table: { defaultValue: { summary: '#1a73e8' }, category: 'Appearance' },
  },
  opacity: {
    name: 'Прозрачность',
    control: { type: 'range', min: 0, max: 1, step: 0.05 },
    table: { defaultValue: { summary: '0.85' }, category: 'Appearance' },
  },
}

export default processBarArgTypes
