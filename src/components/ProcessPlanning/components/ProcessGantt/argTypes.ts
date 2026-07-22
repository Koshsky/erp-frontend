import type { ArgTypes } from '@storybook/vue3-vite'
import type { ProcessGanttProps } from './types'

export const processGanttArgTypes: ArgTypes<ProcessGanttProps> = {
  dayZero: {
    name: 'Начало шкалы',
    control: 'date',
    table: { type: { summary: 'Date | number | null' }, category: 'Data' },
  },
  totalDays: {
    name: 'Всего дней',
    control: { type: 'number', min: 1, max: 365 },
    table: { category: 'Data' },
  },
  projectCode: {
    name: 'Код проекта',
    control: 'text',
    table: { category: 'Content' },
  },
  processes: {
    name: 'Процессы (задачи)',
    description: 'Массив задач в рамках процесса',
    control: 'object',
    table: { type: { summary: 'ProcessItem[]' }, category: 'Data' },
  },
  groupStartDate: {
    name: 'Начало проекта',
    control: 'text',
    table: { category: 'Границы' },
  },
  groupEndDate: {
    name: 'Конец проекта',
    control: 'text',
    table: { category: 'Границы' },
  },
}

export default processGanttArgTypes
