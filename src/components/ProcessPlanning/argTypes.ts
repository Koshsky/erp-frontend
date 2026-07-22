import type { ArgTypes } from '@storybook/vue3-vite'
import type { ProcessPlanningProps } from './types'

export const processPlanningArgTypes: ArgTypes<ProcessPlanningProps> = {
  mockProjects: {
    name: 'Мок-проекты',
    description: 'Массив проектов для отображения без сервера',
    control: 'object',
    table: { type: { summary: 'ProcessPlanningProject[] | null' }, category: 'Mock' },
  },
}

export default processPlanningArgTypes
