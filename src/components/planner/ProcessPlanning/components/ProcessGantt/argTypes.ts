import type { ArgTypes } from '@storybook/vue3-vite'
import type { ProcessGanttProps } from './types'

export const processGanttArgTypes: ArgTypes<ProcessGanttProps> = {
  anchor: {
    name: 'Якорь шкалы',
    description: 'Опорная дата (первая ячейка) для расчёта смещения',
    control: 'date',
    table: { type: { summary: 'Date | number | null' }, category: 'Data' },
  },
  mode: {
    name: 'Период',
    description: 'Период календаря: квартал (92 дня), полугодие или год',
    control: 'select',
    options: ['quarter', 'half', 'year'],
    table: { type: { summary: 'PlanningMode' }, defaultValue: { summary: 'quarter' }, category: 'Data' },
  },
  unit: {
    name: 'Единица ячейки',
    description: 'Сколько дней в одной ячейке шкалы: день, неделя или декада',
    control: 'select',
    options: ['day', 'decade'],
    table: { type: { summary: 'PlanningUnit' }, defaultValue: { summary: 'day' }, category: 'Data' },
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
