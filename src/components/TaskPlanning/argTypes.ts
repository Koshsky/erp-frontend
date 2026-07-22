import type { ArgTypes } from '@storybook/vue3-vite'
import type { TaskPlanningProps } from './types'

export const taskPlanningArgTypes: ArgTypes<TaskPlanningProps> = {
  mockProcesses: {
    name: 'Тестовые процессы',
    description: 'Набор процессов для отображения (режим мок-данных)',
    control: 'object',
    table: {
      type: { summary: 'Process[] | null' },
      defaultValue: { summary: 'null' },
      category: 'Mock Data',
    },
  },
  mockResources: {
    name: 'Тестовые ресурсы',
    description: 'Набор ресурсов (режим мок-данных)',
    control: 'object',
    table: {
      type: { summary: 'Resource[] | null' },
      defaultValue: { summary: 'null' },
      category: 'Mock Data',
    },
  },
}

export default taskPlanningArgTypes
