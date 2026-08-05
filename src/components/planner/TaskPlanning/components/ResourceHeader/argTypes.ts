import type { ArgTypes } from '@storybook/vue3-vite'
import type { ResourceHeaderProps } from './types'

export const resourceHeaderArgTypes: ArgTypes<ResourceHeaderProps> = {
  t: { control: false, table: { disable: true, category: 'Data' } },
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
