/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

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

