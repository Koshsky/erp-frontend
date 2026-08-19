import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import checker from 'vite-plugin-checker'
import { fileURLToPath, URL } from 'node:url'
import { readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

/** Короткий git-хэш + время сборки — уникальная версия каждого релиза */
function buildVersion(root: string): string {
  let hash = 'dev'
  try {
    hash = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim() || 'dev'
  } catch {
    // вне git-репозитория — остаёмся на 'dev'
  }
  return `${hash}-${Date.now().toString(36)}`
}

/**
 * Пишет dist/precache-manifest.json: { version, assets }. Файл используется
 * приложением: версия сборки в UI профиля и проверка доступности сервера
 * (outbox/state). Service Worker отсутствует (не используется), поэтому
 * precache-manifest — это только источник версии, а не список для SW.
 */
function versionManifest(version: string): Plugin {
  let root = process.cwd()
  let outDir = 'dist'
  return {
    name: 'version-manifest',
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
      const payload = { version, assets }
      writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`)
    },
  }
}

export default defineConfig(({ mode }) => {
  // Загрузка переменных окружения из .env (VITE_* и т.п.)
  const env = loadEnv(mode, process.cwd(), '')

  // Адрес бэкенда для dev-прокси (по умолчанию http://localhost:8080)
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

  // Версия сборки вычисляется ОДИН раз: она должна быть идентична и в бандле
  // (__APP_VERSION__), и в precache-manifest.json, иначе сравнение версий в
  // профиле всегда показывало бы «разные» сборки.
  const appVersion = buildVersion(process.cwd())

  return {
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    vue(),
    checker({
      vueTsc: true,
      typescript: true,
    }),
    versionManifest(appVersion),
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
