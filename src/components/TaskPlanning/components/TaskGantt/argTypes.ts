import type { ArgTypes } from '@storybook/vue3-vite'
import type { TaskGanttProps } from './types'

export const taskGanttArgTypes: ArgTypes<TaskGanttProps> = {
  dayZero: {
    name: 'Начало шкалы',
    description: 'Опорная дата для расчёта смещения задач',
    control: 'date',
    table: { type: { summary: 'Date | null' }, category: 'Data' },
  },
  totalDays: {
    name: 'Всего дней',
    description: 'Общее количество дней на шкале',
    control: { type: 'number', min: 1, max: 365 },
    table: { category: 'Data' },
  },
  title: {
    name: 'Название процесса',
    description: 'Заголовок группы задач',
    control: 'text',
    table: { category: 'Content' },
  },
  projectCode: {
    name: 'Код проекта',
    description: 'Код проекта для отображения',
    control: 'text',
    table: { category: 'Content' },
  },
  tasks: {
    name: 'Задачи',
    description: 'Массив задач процесса',
    control: 'object',
    table: { type: { summary: 'Task[]' }, category: 'Data' },
  },
  groupStartDate: {
    name: 'Начало процесса',
    control: 'text',
    table: { category: 'Границы' },
  },
  groupEndDate: {
    name: 'Конец процесса',
    control: 'text',
    table: { category: 'Границы' },
  },
}

export default taskGanttArgTypes
