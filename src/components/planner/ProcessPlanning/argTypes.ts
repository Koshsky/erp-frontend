import type { ArgTypes } from '@storybook/vue3-vite'
import type { ProcessPlanningProps } from './types'

export const processPlanningArgTypes: ArgTypes<ProcessPlanningProps> = {
  projects: {
    name: 'Проекты',
    description: 'Массив проектов (DTO из /planning/processes) для отображения',
    control: 'object',
    table: { type: { summary: 'DtoDetailedProject[] | null' }, category: 'Data' },
  },
  anchor: {
    name: 'Якорь шкалы',
    description: 'Опорная дата (первая ячейка); по умолчанию — самая ранняя дата старта проекта',
    control: 'date',
    table: { type: { summary: 'string | Date | number | null' }, category: 'Data' },
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
  loading: {
    name: 'Загрузка',
    control: 'boolean',
    table: { category: 'State' },
  },
  error: {
    name: 'Ошибка',
    control: 'text',
    table: { category: 'State' },
  },
}

export default processPlanningArgTypes
