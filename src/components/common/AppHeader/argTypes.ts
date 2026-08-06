import type { ArgTypes } from '@storybook/vue3-vite'

export interface AppHeaderProps {
  /** Название бренда в шапке */
  brand?: string
}

export const appHeaderArgTypes: ArgTypes<AppHeaderProps> = {
  brand: {
    name: 'Бренд',
    description: 'Название в левом углу шапки',
    control: 'text',
    table: {
      type: { summary: 'string' },
      defaultValue: { summary: 'MVS ERP' },
      category: 'Content',
    },
  },
}

export default appHeaderArgTypes
