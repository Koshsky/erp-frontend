import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import checker from 'vite-plugin-checker'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  // Загрузка переменных окружения из .env (VITE_* и т.п.)
  const env = loadEnv(mode, process.cwd(), '')

  // Адрес бэкенда для dev-прокси (по умолчанию http://localhost:8080)
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

  return {
  plugins: [
    vue(),
    checker({
      vueTsc: true,
      typescript: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
          target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  }
})

