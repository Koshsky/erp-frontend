import type { ArgTypes } from '@storybook/vue3-vite'
import type { TaskGanttProps } from './types'

export const taskGanttArgTypes: ArgTypes<TaskGanttProps> = {
  anchor: {
    name: 'Якорь шкалы',
    description: 'Опорная дата (первая ячейка) для расчёта смещения задач',
    control: 'date',
    table: { type: { summary: 'Date | null' }, category: 'Data' },
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
  processId: {
    name: 'Идентификатор процесса',
    description: 'ID процесса-родителя (для создания задач/вех в группе)',
    control: 'number',
    table: { type: { summary: 'number' }, category: 'Data' },
  },
  tasks: {
    name: 'Задачи',
    description: 'Массив задач процесса',
    control: 'object',
    table: { type: { summary: 'Task[]' }, category: 'Data' },
  },
  milestones: {
    name: 'Вехи',
    description: 'Массив вех процесса — маркеры в строке заголовка процесса',
    control: 'object',
    table: { type: { summary: 'Milestone[]' }, category: 'Data' },
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
