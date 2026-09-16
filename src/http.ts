import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import router from './router'
import { apiErrorMessage } from './utils'
import { cacheGet, cacheGetByPath, cachePut } from './offline/cache'
import { replayOutboxToCache, scheduleReplayOutboxToCache } from './offline/outbox'
import { isOffline } from './offline/state'
import { getAccessToken } from './token'
import { ensureAutoSession } from './offline/sync'
import { isLoggedOut } from './loggedOut'

/** Paths where 401 does not mean "token expired" — we leave them alone (loop protection) */
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout']

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

/** Full request URL — the single cache key (both write and read) */
function cacheKey(config: InternalAxiosRequestConfig): string {
  return axios.getUri(config)
}

/** The single in-flight refresh for all parallel 401s */
let refreshing: Promise<boolean> | null = null

function redirectToLogin() {
  const current = router.currentRoute.value
  if (current.name !== 'login') {
    void router.push({ name: 'login', query: { redirect: current.fullPath } })
  }
}

/**
 * 401 interceptor: silently refreshes the access token via the refresh token
 * and retries the request. It runs on the shared axios instance used by all
 * generated API clients (src/api/base.ts: globalAxios).
 */
export function setupHttp() {
  // Never attach an EMPTY Authorization header ("Bearer ") — the backend
  // answers such requests with INVALID_TOKEN (invalid authorization format),
  // which the UI misreads as «Сессия истекла». Without a token the header is
  // simply omitted; protected endpoints then return a plain 401 that flows
  // through the normal refresh/retry path below.
  axios.interceptors.request.use((config) => {
    const token = getAccessToken()
    config.headers = config.headers ?? {}
    const auth = String(config.headers['authorization'] || config.headers['Authorization'] || '')
    if (auth.startsWith('Bearer ') && !token) {
      delete config.headers['authorization']
      delete config.headers['Authorization']
    }
    return config
  })

  // Successful GETs are written to the offline cache (network is up — data is fresh).
  // The cache and write-through overlay work in every environment (web and desktop).
  axios.interceptors.response.use(
    async (response) => {
      const { config, status } = response
      if (
        status >= 200 &&
        status < 300 &&
        config.method === 'get' &&
        config.url &&
        !AUTH_PATHS.some((path) => config.url!.includes(path))
      ) {
        await cachePut(cacheKey(config), response.data)
        // Invariant "cache = server + queue": after a fresh write we re-apply
        // unsynchronized mutations — warmup/reconcile must not erase them with
        // server truth (otherwise offline edits are lost after a reload).
        // Coalesced: a burst of parallel GETs schedules a single replay for the
        // whole tick instead of one full outbox+cache scan per response.
        scheduleReplayOutboxToCache()
      }
      return response
    },
    async (error: AxiosError) => {
      const { config } = error
      if (!config) {
        return Promise.reject(error)
      }

      // Server unreachable (network, timeout, abort — any request without an HTTP response):
      // serve the last saved response from the cache (same { data, error } format). Read-time
      // overlay: before reading we apply unsynchronized mutations on top of the warmed cache.
      // This runs in every environment — web and desktop share the same offline read path.
      if (!error.response) {
        if ((config.method ?? 'get').toLowerCase() === 'get') {
          await replayOutboxToCache()
          const key = cacheKey(config)
          let cached = await cacheGet<unknown>(key)
          // The exact key may not match (a GET with a date window depends on "today"
          // and differs after warmup) — look up the fresh response by endpoint.
          if (cached == null) {
            const pathname = (() => {
              try {
                return new URL(key).pathname
              } catch {
                return key.split('?')[0]
              }
            })()
            cached = await cacheGetByPath<unknown>(pathname)
          }
          if (cached != null) {
            isOffline.value = true
            console.log(`[offline] served cache: ${key}`)
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
          console.log(`[offline] cache miss: ${key}`)
        }
        // Network error diagnostics (timeout/drop/CORS/abort) — detailed output to the console.
        const ax = error as AxiosError & { code?: string; timeout?: number }
        console.error(
          `[http] сетевая ошибка (нет HTTP-ответа): ${(config.method || 'get').toUpperCase()} ${config.url ?? ''}`,
          {
            kind: 'network',
            code: ax.code,
            timeout_ms: ax.timeout,
            message: ax.message,
            data: config.data,
          },
        )
        return Promise.reject(error)
      }

      const { response } = error
      if (!response) {
        return Promise.reject(error)
      }

      // Substitute the local error text from the response body ({ data, error })
      // instead of "Request failed with status code …" so the store shows the reason.
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

      // The user explicitly logged out: do not try to restore the session.
      // The refresh cookie is already revoked by the server, /auth/refresh would return 401,
      // and reusing a revoked token is treated by the server as
      // reuse (revoking ALL user sessions) — plus the UI would show a false
      // "Session expired" instead of the expected "logged out" state.
      if (isLoggedOut()) {
        redirectToLogin()
        return Promise.reject(error)
      }

      if ((config as RetryableConfig)._retried) {
        return Promise.reject(error)
      }

      // Renew the session before retry: desktop silently re-logs-in with the stored
      // auto-sync credentials; web refreshes via the HttpOnly cookie. The unified
      // ensureAutoSession picks the right path for the current environment.
      refreshing ??= (async () => {
        return ensureAutoSession()
      })().finally(() => {
        refreshing = null
      })

      const ok = await refreshing
      if (!ok) {
        redirectToLogin()
        return Promise.reject(error)
      }

      // Never retry with an EMPTY bearer: the server answers «invalid
      // authorization format» (INVALID_TOKEN) and the UI shows a misleading
      // «Сессия истекла». If no token could be restored, send the user to the
      // login page instead of firing a request that is guaranteed to fail.
      const token = getAccessToken()
      if (!token) {
        redirectToLogin()
        return Promise.reject(error)
      }

      ;(config as RetryableConfig)._retried = true
      config.headers = config.headers ?? {}
      delete config.headers['authorization']
      config.headers['Authorization'] = `Bearer ${token}`
      return axios(config)
    },
  )
}
