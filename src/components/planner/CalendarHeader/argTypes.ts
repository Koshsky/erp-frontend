import type { ArgTypes } from '@storybook/vue3-vite'
import type { CalendarHeaderProps } from './types'

export const calendarHeaderArgTypes: ArgTypes<CalendarHeaderProps> = {
  startDate: {
    name: 'Дата начала',
    description: 'Первый день отображаемого периода',
    control: 'date',
    table: {
      type: { summary: 'Date' },
      category: 'Data',
    },
  },
  endDate: {
    name: 'Дата окончания',
    description: 'Последний день отображаемого периода',
    control: 'date',
    table: {
      type: { summary: 'Date' },
      category: 'Data',
    },
  },
}

export default calendarHeaderArgTypes
