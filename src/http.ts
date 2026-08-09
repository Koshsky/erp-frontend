import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from './store'
import router from './router'

const TOKEN_KEY = 'mvs_erp_access_token'
const REFRESH_KEY = 'mvs_erp_refresh_token'

/** Пути, где 401 не означает «токен протух» — их не трогаем (защита от петли) */
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/register']

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
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
  axios.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const { config, response } = error
      if (!config || !response) {
        return Promise.reject(error)
      }

      // Подставляем текст ошибки из тела ответа ({ data, error }) вместо
      // «Request failed with status code …», чтобы стора показывала причину.
      if (response.status >= 400) {
        const body = response.data as { error?: string; data?: { error?: string } } | undefined
        const msg = body?.error || body?.data?.error
        if (msg) {
          ;(error as AxiosError & { message: string }).message = msg
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
