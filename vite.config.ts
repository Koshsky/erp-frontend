import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import checker from 'vite-plugin-checker'
import { fileURLToPath, URL } from 'node:url'
import { readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Пишет dist/precache-manifest.json со списком всех ассетов сборки.
 * Service Worker при установке догружает этот список и кэширует ВСЕ чанки
 * (включая lazy-чанки неоткрытых страниц), а при активации чистит по нему
 * устаревшие ассеты. Это «прогрев» офлайн-оболочки без внешних плагинов.
 */
function precacheManifest(): Plugin {
  let root = process.cwd()
  let outDir = 'dist'
  return {
    name: 'precache-manifest',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    closeBundle() {
      const assetsDir = resolve(root, outDir, 'assets')
      let assets: string[] = []
      try {
        assets = readdirSync(assetsDir)
          .filter((f) => !f.endsWith('.map') && /\.(js|mjs|css|ttf|woff2?|svg|png)$/.test(f))
          .map((f) => `/assets/${f}`)
          .sort()
      } catch {
        // каталога ассетов нет (пустая сборка) — оставляем пустой список
      }
      const dest = resolve(root, outDir, 'precache-manifest.json')
      writeFileSync(dest, `${JSON.stringify(assets, null, 2)}\n`)
    },
  }
}

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
    precacheManifest(),
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

