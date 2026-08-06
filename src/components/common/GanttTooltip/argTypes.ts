import type { ArgTypes } from '@storybook/vue3-vite'
import type { GanttTooltipProps } from './types'

export const ganttTooltipArgTypes: ArgTypes<GanttTooltipProps> = {
  title: {
    name: 'Заголовок',
    description: 'Название бара в тултипе',
    control: 'text',
    table: { type: { summary: 'string' }, category: 'Content' },
  },
  rows: {
    name: 'Строки',
    description: 'Дополнительные строки (даты, владелец, приоритет)',
    control: 'object',
    table: { type: { summary: 'string[]' }, category: 'Content' },
  },
  resources: {
    name: 'Ресурсы',
    description: 'Список ресурсов: { label, quantity? }',
    control: 'object',
    table: { type: { summary: 'GanttTooltipResource[]' }, category: 'Content' },
  },
}

export default ganttTooltipArgTypes
