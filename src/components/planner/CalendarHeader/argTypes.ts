import type { ArgTypes } from '@storybook/vue3-vite'
import type { CalendarHeaderProps } from './types'

export const calendarHeaderArgTypes: ArgTypes<CalendarHeaderProps> = {
  anchor: {
    name: 'Якорь шкалы',
    description: 'Опорная дата (первая ячейка) для расчёта смещения',
    control: 'date',
    table: {
      type: { summary: 'Date' },
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
}

export default calendarHeaderArgTypes
