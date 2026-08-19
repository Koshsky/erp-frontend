/// <reference types="vite/client" />

/** Версия запущенного бандла (инжектится на build через define) */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Базовый URL API (по умолчанию /api/v1) */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/** Воркер pdf.js импортируется на главном потоке (fake worker) ради полифилов */
declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  const workerModule: unknown
  export default workerModule
}

/**
 * Мост Electron, инжектируемый preload (services/desktop/preload.js).
 * В браузере отсутствует — приложение продолжает работать как обычный PWA.
 */
interface ErpDesktopPassword {
  get: () => Promise<string | null>
  set: (value: string) => Promise<boolean>
  clear: () => Promise<boolean>
}

interface ErpDesktop {
  isElectron: true
  appVersion: () => Promise<{ version: string; electron: string }>
  password: ErpDesktopPassword
}

interface Window {
  erpDesktop?: ErpDesktop
}

