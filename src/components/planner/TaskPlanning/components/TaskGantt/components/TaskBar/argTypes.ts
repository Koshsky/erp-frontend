import type { ArgTypes } from '@storybook/vue3-vite'
import type { TaskBarProps } from './types'

export const taskBarArgTypes: ArgTypes<TaskBarProps> = {
  anchor: {
    name: 'Якорь шкалы',
    description: 'Опорная дата (первая ячейка) для расчёта смещения задачи',
    control: 'date',
    table: {
      type: { summary: 'Date | null' },
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
