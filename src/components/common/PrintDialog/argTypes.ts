import type { ArgTypes } from '@storybook/vue3-vite'
import type { PrintDialogProps } from './types'

export const printDialogArgTypes: ArgTypes<PrintDialogProps> = {
  open: {
    name: 'Видимость',
    description: 'Показывать ли диалог',
    control: 'boolean',
    table: {
      type: { summary: 'boolean' },
      defaultValue: { summary: 'false' },
      category: 'Behavior',
    },
  },
  unit: {
    name: 'Масштаб шкалы',
    description: 'День / Декада',
    control: { type: 'radio', options: ['day', 'decade'] },
    table: { type: { summary: 'day | decade' }, defaultValue: { summary: 'day' }, category: 'Behavior' },
  },
  scale: {
    name: 'Масштаб печати, %',
    description: '100% — вписать диаграмму в один лист',
    control: { type: 'range', min: 25, max: 200, step: 5 },
    table: { type: { summary: 'number' }, defaultValue: { summary: '100' }, category: 'Behavior' },
  },
  orientation: {
    name: 'Ориентация',
    description: 'Портрет / Ландшафт',
    control: { type: 'radio', options: ['portrait', 'landscape'] },
    table: { type: { summary: 'portrait | landscape' }, defaultValue: { summary: 'landscape' }, category: 'Behavior' },
  },
}

export default printDialogArgTypes
