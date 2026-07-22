import type { ArgTypes } from '@storybook/vue3-vite'
import type { UsageCellProps } from './types'

export const usageCellArgTypes: ArgTypes<UsageCellProps> = {
  used: {
    name: 'Занято',
    description: 'Сколько ресурса уже занято',
    control: { type: 'number', min: 0, max: 10 },
    table: { type: { summary: 'number' }, category: 'Data' },
  },
  total: {
    name: 'Всего',
    description: 'Сколько всего ресурса доступно',
    control: { type: 'number', min: 1, max: 10 },
    table: { type: { summary: 'number' }, category: 'Data' },
  },
  isWeekend: {
    name: 'Выходной',
    description: 'Является ли день выходным (нерабочим)',
    control: 'boolean',
    table: { type: { summary: 'boolean' }, category: 'Data' },
  },
}

export default usageCellArgTypes
