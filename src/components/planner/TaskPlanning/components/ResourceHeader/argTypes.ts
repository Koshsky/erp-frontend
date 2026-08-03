import type { ArgTypes } from '@storybook/vue3-vite'
import type { ResourceHeaderProps } from './types'

export const resourceHeaderArgTypes: ArgTypes<ResourceHeaderProps> = {
  anchor: {
    name: 'Якорь шкалы',
    description: 'Опорная дата (первая ячейка) для расчёта смещения',
    control: 'date',
    table: {
      type: { summary: 'Date | number' },
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
  resources: {
    name: 'Ресурсы',
    description: 'Массив ресурсов с количеством',
    control: 'object',
    table: {
      type: { summary: 'Resource[]' },
      category: 'Data',
    },
  },
  usageFn: {
    name: 'Функция занятости',
    description: 'Функция расчёта занятости ресурса на указанную дату',
    control: false,
    table: {
      type: { summary: '(resourceId: number, day: Date) => number' },
      category: 'Logic',
    },
  },
}

export default resourceHeaderArgTypes
