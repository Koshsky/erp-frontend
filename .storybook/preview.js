import { withCustomTheme } from './decorators/withCustomTheme'
import { withColorScheme } from './decorators/withColorScheme'

/** @type { import('@storybook/vue3-vite').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },

  globalTypes: {
    theme: {
      name: 'Тема оформления',
      description: 'Глобальная тема для компонентов',
      defaultValue: 'default',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: 'default', title: 'Стандартная' },
          { value: 'compact', title: 'Компактная' },
          { value: 'minimal', title: 'Минималистичная' },
        ],
      },
    },
    scheme: {
      name: 'Цветовая схема',
      description: 'Светлая или тёмная схема',
      defaultValue: 'light',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Светлая', icon: 'sun' },
          { value: 'dark', title: 'Тёмная', icon: 'moon' },
        ],
      },
    },
  },

  decorators: [withCustomTheme, withColorScheme],
}

export default preview
