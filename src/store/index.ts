import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AuthApi, ProjectsApi, ResourcesApi, PlanningApi, UsersApi, Configuration } from '@/api'
import type { DtoUserInfo, DtoProject, DtoResource, JwtTokenPair } from '@/api'

const TOKEN_KEY = 'mvs_erp_access_token'
const REFRESH_KEY = 'mvs_erp_refresh_token'
const USER_KEY = 'mvs_erp_user'

/** Сколько времени до истечения токена, когда начинаем проактивный refresh */
const REFRESH_MARGIN_MS = 60 * 1000
const REFRESH_INTERVAL_MS = 30 * 1000

function apiConfig(): Configuration {
  return new Configuration({
    basePath: import.meta.env.VITE_API_URL,
    baseOptions: { headers: { 'Content-Type': 'application/json' } },
    apiKey: () => `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}`,
  })
}

function readStoredUser(): DtoUserInfo | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as DtoUserInfo) : null
  } catch {
    return null
  }
}

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  return atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))
}

/** Время истечения (epoch ms) из payload access-токена или null, если разобрать нельзя */
function decodeTokenExp(token: string | null): number | null {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const data = JSON.parse(base64UrlDecode(payload)) as { exp?: number }
    return typeof data.exp === 'number' ? data.exp * 1000 : null
  } catch {
    return null
  }
}

/** Протух ли access-токен: отсутствует, не парсится или exp уже прошёл */
function accessTokenExpired(): boolean {
  const exp = decodeTokenExp(localStorage.getItem(TOKEN_KEY))
  if (exp == null) return true
  return exp - Date.now() <= 0
}

/** Не пора ли продлить токен заранее (до истечения меньше запаса) */
function accessTokenExpiring(): boolean {
  const exp = decodeTokenExp(localStorage.getItem(TOKEN_KEY))
  if (exp == null) return true
  return exp - Date.now() <= REFRESH_MARGIN_MS
}

// === Auth ===
export const useAuthStore = defineStore('auth', () => {
  const user = ref<DtoUserInfo | null>(readStoredUser())
  const isAuthenticated = ref<boolean>(Boolean(localStorage.getItem(TOKEN_KEY)))
  const accessExpired = computed<boolean>(() => accessTokenExpired())
  const loading = ref(false)
  const error = ref<string | null>(null)

  function applySession(data: { tokens?: JwtTokenPair; user?: DtoUserInfo } | undefined) {
    const token = data?.tokens?.access_token
    const refresh = data?.tokens?.refresh_token
    if (token) localStorage.setItem(TOKEN_KEY, token)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
    if (data?.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      user.value = data.user
    }
    isAuthenticated.value = Boolean(token)
    scheduleProactiveRefresh()
  }

  async function login(username: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const api = new AuthApi(apiConfig())
      const resp = await api.authLoginPost({ username, password })
      const body = resp.data
      if (body?.error) throw new Error(body.error)
      applySession(body?.data)
      return true
    } catch (e: any) {
      error.value = e.message || String(e)
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(username: string, password: string, name: string) {
    loading.value = true
    error.value = null
    try {
      const api = new AuthApi(apiConfig())
      const resp = await api.authRegisterPost({ username, password, name })
      const body = resp.data
      if (body?.error) throw new Error(body.error)
      applySession(body?.data)
      return true
    } catch (e: any) {
      error.value = e.message || String(e)
      return false
    } finally {
      loading.value = false
    }
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    loading.value = true
    error.value = null
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userChangePasswordPost({
        old_password: oldPassword,
        new_password: newPassword,
      })
      const body = resp.data
      if (body?.error) throw new Error(body.error)
      return true
    } catch (e: any) {
      error.value = e.message || String(e)
      return false
    } finally {
      loading.value = false
    }
  }

  let proactiveTimer: number | null = null
  let onVisibilityChange: (() => void) | null = null
  let refreshInFlight: Promise<boolean> | null = null

  /** Проактивный refresh: таймер + возврат вкладки, чтобы access-токен не успевал протухнуть */
  function scheduleProactiveRefresh() {
    if (proactiveTimer != null) return
    proactiveTimer = window.setInterval(() => {
      if (accessTokenExpiring() && localStorage.getItem(REFRESH_KEY)) {
        void refreshSession()
      }
    }, REFRESH_INTERVAL_MS)
    onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && accessTokenExpiring()) {
        void refreshSession()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function stopProactiveRefresh() {
    if (proactiveTimer != null) {
      clearInterval(proactiveTimer)
      proactiveTimer = null
    }
    if (onVisibilityChange) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      onVisibilityChange = null
    }
  }

  /** Обновляет access-токен по refresh-токену; при неудаче разлогинивает.
   *  Параллельные вызовы (таймер/guard/интерцептор) дедуплицируются в один запрос */
  async function refreshSession(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight
    refreshInFlight = doRefresh()
    try {
      return await refreshInFlight
    } finally {
      refreshInFlight = null
    }
  }

  async function doRefresh(): Promise<boolean> {
    const refresh = localStorage.getItem(REFRESH_KEY)
    if (!refresh) {
      logout()
      return false
    }
    loading.value = true
    error.value = null
    try {
      const api = new AuthApi(apiConfig())
      const resp = await api.authRefreshPost({ refresh_token: refresh })
      const body = resp.data
      if (body?.error) throw new Error(body.error)
      applySession(body?.data)
      return true
    } catch (e: any) {
      error.value = e.message || String(e)
      logout()
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    stopProactiveRefresh()
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    user.value = null
    isAuthenticated.value = false
  }

  /** Получает свежие данные пользователя по id через UsersApi.userIdGet */
  async function fetchProfile(userId: number) {
    error.value = null
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userIdGet(userId)
      const body = resp.data
      if (body?.error) throw new Error(body.error)
      if (body?.data) {
        user.value = body.data as DtoUserInfo
        localStorage.setItem(USER_KEY, JSON.stringify(user.value))
      }
      return true
    } catch (e: any) {
      error.value = e.message || String(e)
      return false
    }
  }

  // После перезагрузки страницы с сохранёнными токенами продолжаем проактивный refresh
  if (isAuthenticated.value) scheduleProactiveRefresh()

  return {
    user,
    isAuthenticated,
    accessExpired,
    loading,
    error,
    login,
    register,
    changePassword,
    refreshSession,
    fetchProfile,
    logout,
  }
})

// === App (проекты и ресурсы) ===
export const useAppStore = defineStore('app', () => {
  const projects = ref<DtoProject[]>([])
  const projectsLoading = ref(false)
  const projectsError = ref<string | null>(null)

  async function loadProjects() {
    projectsLoading.value = true
    projectsError.value = null
    try {
      const api = new ProjectsApi(apiConfig())
      const resp = await api.projectGet()
      projects.value = resp.data?.data ?? []
    } catch (e: any) {
      projectsError.value = e.message || String(e)
    } finally {
      projectsLoading.value = false
    }
  }

  const resources = ref<DtoResource[]>([])
  const resourcesLoading = ref(false)
  const resourcesError = ref<string | null>(null)

  async function loadResources() {
    resourcesLoading.value = true
    resourcesError.value = null
    try {
      const api = new ResourcesApi(apiConfig())
      const resp = await api.resourceGet()
      resources.value = resp.data?.data ?? []
    } catch (e: any) {
      resourcesError.value = e.message || String(e)
    } finally {
      resourcesLoading.value = false
    }
  }

  const totalProjects = computed(() => projects.value.length)
  const totalResources = computed(() => resources.value.length)

  return {
    projects,
    projectsLoading,
    projectsError,
    resources,
    resourcesLoading,
    resourcesError,
    totalProjects,
    totalResources,
    loadProjects,
    loadResources,
  }
})

// === Planning (данные из /planning/* для трёх диаграмм) ===
export const usePlanningStore = defineStore('planning', () => {
  const projectPlanning = ref<any>(null)
  const processPlanning = ref<any>(null)
  const taskPlanning = ref<any>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadProjectPlanning() {
    loading.value = true
    error.value = null
    try {
      const api = new PlanningApi(apiConfig())
      const resp = await api.planningProjectsGet()
      projectPlanning.value = resp.data?.data ?? null
    } catch (e: any) {
      error.value = e.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function loadProcessPlanning() {
    loading.value = true
    error.value = null
    try {
      const api = new PlanningApi(apiConfig())
      const resp = await api.planningProcessesGet()
      processPlanning.value = resp.data?.data ?? null
    } catch (e: any) {
      error.value = e.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function loadTaskPlanning() {
    loading.value = true
    error.value = null
    try {
      const api = new PlanningApi(apiConfig())
      const resp = await api.planningTasksGet()
      taskPlanning.value = resp.data?.data ?? null
    } catch (e: any) {
      error.value = e.message || String(e)
    } finally {
      loading.value = false
    }
  }

  return {
    projectPlanning,
    processPlanning,
    taskPlanning,
    loading,
    error,
    loadProjectPlanning,
    loadProcessPlanning,
    loadTaskPlanning,
  }
})
