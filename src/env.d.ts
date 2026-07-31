/// <reference types="vite/client" />

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

