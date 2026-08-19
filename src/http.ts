import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from './store'
import router from './router'
import { apiErrorMessage } from './utils'
import { cacheGet, cachePut } from './offline/cache'
import { replayOutboxToCache } from './offline/outbox'
import { isOffline } from './offline/state'
import { isElectron } from './electron'

const TOKEN_KEY = 'mvs_erp_access_token'
const REFRESH_KEY = 'mvs_erp_refresh_token'

/** Пути, где 401 не означает «токен протух» — их не трогаем (защита от петли) */
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/register']

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

/** Полный URL запроса — единый ключ для кэша (и запись, и чтение) */
function cacheKey(config: InternalAxiosRequestConfig): string {
  return axios.getUri(config)
}

/** Единственный «в полёте» refresh для всех параллельных 401 */
let refreshing: Promise<boolean> | null = null

function redirectToLogin() {
  const current = router.currentRoute.value
  if (current.name !== 'login') {
    void router.push({ name: 'login', query: { redirect: current.fullPath } })
  }
}

/**
 * Перехватчик 401: тихо обновляет access-токен по refresh-токену и повторяет
 * запрос. Срабатывает на общем axios-инстансе, который используют все
 * сгенерированные API-клиенты (src/api/base.ts: globalAxios).
 */
export function setupHttp() {
  // Успешные GET пишем в офлайн-кэш (сеть доступна — данные свежие).
  // Кэш и write-through overlay нужны только офлайн-режиму (Electron).
  axios.interceptors.response.use(
    async (response) => {
      const { config, status } = response
      if (
        isElectron &&
        status >= 200 &&
        status < 300 &&
        config.method === 'get' &&
        config.url &&
        !AUTH_PATHS.some((path) => config.url!.includes(path))
      ) {
        await cachePut(cacheKey(config), response.data)
        // Инвариант «кэш = сервер + очередь»: после свежей записи снова накладываем
        // несинхронизированные мутации — warmup/reconcile не должны стирать их
        // серверной правдой (иначе офлайн-правки пропадают после перезагрузки).
        await replayOutboxToCache()
      }
      return response
    },
    async (error: AxiosError) => {
      const { config } = error
      if (!config) {
        return Promise.reject(error)
      }

      // Сервер недоступен (сеть, таймаут, abort — любой запрос без HTTP-ответа):
      // в офлайн-режиме (Electron) отдаём последний сохранённый ответ из кэша
      // (тот же формат { data, error }). Read-time overlay: перед чтением
      // накладываем несинхронизированные мутации на нагретый кэш.
      // В web-сборке офлайна нет — просто пробрасываем ошибку.
      if (!error.response) {
        if (isElectron && (config.method ?? 'get').toLowerCase() === 'get') {
          await replayOutboxToCache()
          const cached = await cacheGet<unknown>(cacheKey(config))
          if (cached != null) {
            isOffline.value = true
            console.log(`[offline] served cache: ${cacheKey(config)}`)
            return {
              data: cached,
              status: 200,
              statusText: 'OK',
              headers: {},
              config,
              request: error.request,
            }
          }
          ;(error as AxiosError & { message: string }).message =
            'Нет сохранённых данных: откройте эту страницу онлайн хотя бы раз'
          console.log(`[offline] cache miss: ${cacheKey(config)}`)
        }
        return Promise.reject(error)
      }

      const { response } = error
      if (!response) {
        return Promise.reject(error)
      }

      // Подставляем локальный текст ошибки из тела ответа ({ data, error })
      // вместо «Request failed with status code …», чтобы стора показывала причину.
      if (response.status >= 400) {
        const body = response.data as { error?: { message?: string; code?: string | number } } | undefined
        if (body?.error) {
          ;(error as AxiosError & { message: string }).message = apiErrorMessage(body.error)
        }
      }

      if (response.status !== 401) {
        return Promise.reject(error)
      }

      const url = config.url ?? ''
      if (AUTH_PATHS.some((path) => url.includes(path))) {
        return Promise.reject(error)
      }

      const auth = useAuthStore()

      if (!localStorage.getItem(REFRESH_KEY)) {
        auth.logout()
        redirectToLogin()
        return Promise.reject(error)
      }

      if ((config as RetryableConfig)._retried) {
        return Promise.reject(error)
      }

      refreshing ??= auth.refreshSession().finally(() => {
        refreshing = null
      })

      const ok = await refreshing
      if (!ok) {
        redirectToLogin()
        return Promise.reject(error)
      }

      ;(config as RetryableConfig)._retried = true
      const token = localStorage.getItem(TOKEN_KEY) ?? ''
      config.headers = config.headers ?? {}
      delete config.headers['authorization']
      config.headers['Authorization'] = `Bearer ${token}`
      return axios(config)
    },
  )
}
