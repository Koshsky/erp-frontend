import type { Decorator } from '@storybook/vue3-vite'

export type ColorScheme = 'light' | 'dark'

export const withColorScheme: Decorator = (story, context) => {
  const scheme: ColorScheme = (context.globals.scheme as ColorScheme) || 'light'

  return {
    components: { story },
    setup() {
      const isDark = scheme === 'dark'
      const bg = isDark ? '#1a1a2e' : '#f4f6f9'
      const color = isDark ? '#e0e0e0' : '#2c3e50'
      return { bg, color, isDark }
    },
    template: `
      <div :style="{ background: bg, color: color, padding: '16px', minHeight: '100vh' }">
        <story />
      </div>
    `,
  }
}

export default withColorScheme
