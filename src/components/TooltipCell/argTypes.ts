import type { ArgTypes } from '@storybook/vue3-vite'
import type { TooltipCellProps } from './types'

export const tooltipCellArgTypes: ArgTypes<TooltipCellProps> = {
  text: {
    name: 'Текст подсказки',
    description: 'Текст, отображаемый во всплывающей подсказке',
    control: 'text',
    table: {
      type: { summary: 'string' },
      defaultValue: { summary: '—' },
      category: 'Content',
    },
  },
}

export default tooltipCellArgTypes
