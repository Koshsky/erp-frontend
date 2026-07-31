import type { ArgTypes } from '@storybook/vue3-vite'
import type { TaskBarProps } from './types'

export const taskBarArgTypes: ArgTypes<TaskBarProps> = {
  dayZero: {
    name: 'Начало шкалы',
    description: 'Опорная дата для расчёта смещения задачи',
    control: 'date',
    table: {
      type: { summary: 'Date | null' },
      category: 'Data',
    },
  },
  totalDays: {
    name: 'Всего дней',
    description: 'Общее количество дней',
    control: { type: 'number', min: 1, max: 365 },
    table: {
      type: { summary: 'number' },
      category: 'Data',
    },
  },
  task: {
    name: 'Задача',
    description: 'Объект задачи с датами и ресурсами',
    control: 'object',
    table: {
      type: { summary: 'Task' },
      category: 'Data',
    },
  },
}

export default taskBarArgTypes
