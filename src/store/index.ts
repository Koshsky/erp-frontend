import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AuthApi, ProjectsApi, ProcessesApi, TasksApi, TimesheetResourcesApi, TimesheetCalendarApi, TimesheetEmployeesApi, TimesheetStatesApi, PlanningApi, MilestonesApi, UsersApi, AssignmentsApi, Configuration } from '@/api'
import type { DtoUserInfo, DtoProject, DtoResourceResponse, DtoResourceCalendar, DtoEmployeeResponse, DtoEmployeeStateResponse, DtoStateResponse, DtoCreateResourceRequest, DtoUpdateResourceRequest, JwtTokenPair } from '@/api'
import { apiErrorMessage } from '@/utils'

const TOKEN_KEY = 'mvs_erp_access_token'
const REFRESH_KEY = 'mvs_erp_refresh_token'
const USER_KEY = 'mvs_erp_user'

/** Сколько времени до истечения токена, когда начинаем проактивный refresh */
const REFRESH_MARGIN_MS = 60 * 1000
const REFRESH_INTERVAL_MS = 30 * 1000

/** Размер страницы листингов (совпадает с дефолтом бэкенда). */
const PAGE_SIZE = 50

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

  function applySession(
    data:
      | { access_token?: string; refresh_token?: string; user?: DtoUserInfo; tokens?: JwtTokenPair }
      | undefined,
  ) {
    const token = data?.access_token ?? data?.tokens?.access_token
    const refresh = data?.refresh_token ?? data?.tokens?.refresh_token
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
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
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
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
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
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
      return true
    } catch (e: any) {
      error.value = apiErrorMessage(e?.response?.data?.error, e?.message ?? String(e))
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
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
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
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
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
  const projectsTotal = ref(0)
  const projectsLoading = ref(false)
  const projectsError = ref<string | null>(null)

  async function loadProjects() {
    projectsLoading.value = true
    projectsError.value = null
    try {
      const api = new ProjectsApi(apiConfig())
      const resp = await api.projectGet(PAGE_SIZE, undefined, 0)
      const data = resp.data?.data
      projects.value = data?.items ?? []
      projectsTotal.value = data?.total ?? 0
    } catch (e: any) {
      projectsError.value = e.message || String(e)
    } finally {
      projectsLoading.value = false
    }
  }

  const resources = ref<DtoResourceResponse[]>([])
  const resourcesTotal = ref(0)
  const resourcesLoading = ref(false)
  const resourcesError = ref<string | null>(null)

  async function loadResources(ownerId?: number) {
    resourcesLoading.value = true
    resourcesError.value = null
    try {
      const api = new TimesheetResourcesApi(apiConfig())
      const resp = await api.resourcesGet(PAGE_SIZE, ownerId ?? undefined, 0)
      const data = resp.data?.data
      resources.value = data?.items ?? []
      resourcesTotal.value = data?.total ?? 0
    } catch (e: any) {
      resourcesError.value = e.message || String(e)
    } finally {
      resourcesLoading.value = false
    }
  }

  async function createResource(payload: DtoCreateResourceRequest): Promise<boolean> {
    resourcesError.value = null
    try {
      const api = new TimesheetResourcesApi(apiConfig())
      const resp = await api.resourcesPost(payload)
      const body = resp.data
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
      if (body?.data) resources.value.push(body.data)
      return true
    } catch (e: any) {
      resourcesError.value = e.message || String(e)
      return false
    }
  }

  async function updateResource(id: number, patch: DtoUpdateResourceRequest): Promise<boolean> {
    resourcesError.value = null
    try {
      const api = new TimesheetResourcesApi(apiConfig())
      const resp = await api.resourcesIdPut(id, patch)
      const body = resp.data
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
      const updated = body?.data
      if (updated) {
        const i = resources.value.findIndex((r) => r.id === id)
        if (i >= 0) resources.value[i] = updated
      }
      return true
    } catch (e: any) {
      resourcesError.value = e.message || String(e)
      return false
    }
  }

  async function deleteResource(id: number): Promise<boolean> {
    resourcesError.value = null
    try {
      await new TimesheetResourcesApi(apiConfig()).resourcesIdDelete(id)
      const i = resources.value.findIndex((r) => r.id === id)
      if (i >= 0) resources.value.splice(i, 1)
      return true
    } catch (e: any) {
      resourcesError.value = e.message || String(e)
      return false
    }
  }

  // === Календарь доступности ресурсов (/timesheet/calendar) ===
  // Окно загрузки: назад 180 дней, вперёд 360 (всего 540 < лимита бэкенда 730 дней).
  const CALENDAR_BACK_DAYS = 180
  const CALENDAR_FORWARD_DAYS = 360
  const calendar = ref<DtoResourceCalendar[]>([])
  const calendarLoading = ref(false)
  const calendarError = ref<string | null>(null)

  /** Дата YYYY-MM-DD через n дней от базовой (для окна загрузки календаря) */
  function calendarDay(day: Date, offsetDays: number): string {
    const d = new Date(day.getTime() + offsetDays * 86_400_000)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${dd}`
  }

  /** Загружает доступность ресурсов за окно «назад 180 / вперёд 360 дней» (в лимите бэкенда) */
  async function loadCalendar() {
    calendarLoading.value = true
    calendarError.value = null
    try {
      const today = new Date()
      const api = new TimesheetCalendarApi(apiConfig())
      const resp = await api.timesheetCalendarGet(
        calendarDay(today, -CALENDAR_BACK_DAYS),
        calendarDay(today, CALENDAR_FORWARD_DAYS),
      )
      calendar.value = resp.data?.data?.resources ?? []
    } catch (e: any) {
      calendarError.value = e.message || String(e)
    } finally {
      calendarLoading.value = false
    }
  }

  const users = ref<DtoUserInfo[]>([])
  const usersLoading = ref(false)
  const usersError = ref<string | null>(null)

  async function loadUsers() {
    usersLoading.value = true
    usersError.value = null
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userGet()
      users.value = resp.data?.data ?? []
    } catch (e: any) {
      usersError.value = e.message || String(e)
    } finally {
      usersLoading.value = false
    }
  }

  const totalProjects = computed(() => projectsTotal.value)
  const totalResources = computed(() => resourcesTotal.value)

  return {
    projects,
    projectsTotal,
    projectsLoading,
    projectsError,
    resources,
    resourcesTotal,
    resourcesLoading,
    resourcesError,
    users,
    usersLoading,
    usersError,
    totalProjects,
    totalResources,
    calendar,
    calendarLoading,
    calendarError,
    loadProjects,
    loadResources,
    loadCalendar,
    loadUsers,
    createResource,
    updateResource,
    deleteResource,
  }
})

// === Табель (состояния сотрудников, страница для vp/admin) ===
export const useTimesheetStore = defineStore('timesheet', () => {
  // Окно загрузки состояний: по умолчанию «назад 180 / вперёд 360 дней»; при
  // инфинит-скролле шкалы расширяется через ensureRange (дозагрузка новых диапазонов).
  const WINDOW_BACK_DAYS = 180
  const WINDOW_FORWARD_DAYS = 360

  const employees = ref<DtoEmployeeResponse[]>([])
  const employeesTotal = ref(0)
  const states = ref<DtoStateResponse[]>([])
  const periodsByEmployee = ref<Record<number, DtoEmployeeStateResponse[]>>({})
  const windowStart = ref('')
  const windowEnd = ref('')
  const loading = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)

  /** Дата YYYY-MM-DD через n дней от ISO-даты (локальная зона) */
  function shiftDate(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00`)
    d.setDate(d.getDate() + days)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${dd}`
  }

  function todayISO(): string {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${dd}`
  }

  function setError(e: any) {
    error.value = e?.message || String(e)
  }

  /** Загружает состояния сотрудников за [start, end] и мёржит в кэш по id */
  async function fetchPeriods(start: string, end: string) {
    const api = new TimesheetEmployeesApi(apiConfig())
    const results = await Promise.all(
      employees.value.map((emp) =>
        api
          .employeesIdDaysGet(emp.id ?? 0, start, end)
          .then((r) => ({ id: emp.id, list: r.data?.data ?? [] }))
          .catch((e: any) => {
            setError(e)
            return { id: emp.id, list: [] }
          }),
      ),
    )
    for (const { id, list } of results) {
      if (id == null) continue
      const existing = periodsByEmployee.value[id] ?? []
      const byId = new Map<number, DtoEmployeeStateResponse>()
      for (const p of existing) if (p.id != null) byId.set(p.id, p)
      for (const p of list) if (p.id != null) byId.set(p.id, p)
      periodsByEmployee.value[id] = [...byId.values()].sort((a, b) =>
        (a.start_date ?? '').localeCompare(b.start_date ?? ''),
      )
    }
  }

  /** Период сотрудника, покрывающий день (бинарный поиск по отсортированным периодам) */
  function periodFor(employeeId: number, iso: string): DtoEmployeeStateResponse | undefined {
    const list = periodsByEmployee.value[employeeId] ?? []
    let lo = 0
    let hi = list.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if ((list[mid].start_date ?? '') <= iso) {
        ans = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    const p = list[ans]
    return p && p.end_date != null && p.end_date >= iso ? p : undefined
  }

  /** Загружает список сотрудников (бэкенд фильтрует по роли из JWT: vp — подчинённые, admin — все) */
  async function fetchEmployees(managerId?: number) {
    loading.value = true
    error.value = null
    try {
      const api = new TimesheetEmployeesApi(apiConfig())
      const resp = await api.employeesGet(PAGE_SIZE, managerId ?? undefined, 0)
      const data = resp.data?.data
      // Сортировка: сначала должность (position, с запасом на resource_title), затем ФИО
      employees.value = (data?.items ?? []).sort(
        (a, b) =>
          (a.position || a.resource_title || '').localeCompare(b.position || b.resource_title || '', 'ru') ||
          (a.name ?? '').localeCompare(b.name ?? '', 'ru'),
      )
      employeesTotal.value = data?.total ?? 0
    } catch (e: any) {
      setError(e)
    } finally {
      loading.value = false
    }
  }

  /** Загружает сотрудников и инициализирует окно состояний (для табеля) */
  async function loadEmployees() {
    periodsByEmployee.value = {}
    await fetchEmployees()
    await loadInitialWindow()
  }

  /** Поля запроса создания/изменения сотрудника */
  interface EmployeePayload {
    name: string
    resource_id?: number
    position?: string
    manager_id?: number
    hire_date?: string
    termination_date?: string
  }

  /** Создаёт сотрудника на должности (ресурсе); для vp manager принудительно = текущему пользователю */
  async function createEmployee(resourceId: number, payload: EmployeePayload): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const api = new TimesheetEmployeesApi(apiConfig())
      await api.resourcesIdEmployeesPost(resourceId, payload)
      await fetchEmployees()
      return true
    } catch (e: any) {
      setError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  /** Изменяет сотрудника; для vp manager принудительно = текущему пользователю */
  async function updateEmployee(id: number, payload: EmployeePayload): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const api = new TimesheetEmployeesApi(apiConfig())
      await api.employeesIdPut(id, payload)
      await fetchEmployees()
      return true
    } catch (e: any) {
      setError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  /** Удаляет сотрудника (мягкое удаление) */
  async function deleteEmployee(id: number): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const api = new TimesheetEmployeesApi(apiConfig())
      await api.employeesIdDelete(id)
      await fetchEmployees()
      return true
    } catch (e: any) {
      setError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  /** Загружает справочник состояний */
  async function loadStates() {
    try {
      const api = new TimesheetStatesApi(apiConfig())
      const resp = await api.timesheetStatesGet()
      states.value = resp.data?.data ?? []
    } catch (e: any) {
      setError(e)
    }
  }

  /** Поля запроса создания/изменения статуса */
  interface StatePayload {
    code: string
    name: string
    is_available: boolean
  }

  /** Создаёт статус и обновляет справочник */
  async function createState(payload: StatePayload): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      await new TimesheetStatesApi(apiConfig()).timesheetStatesPost(payload)
      await loadStates()
      return true
    } catch (e: any) {
      setError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  /** Изменяет статус и обновляет справочник */
  async function updateState(id: number, payload: StatePayload): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      await new TimesheetStatesApi(apiConfig()).timesheetStatesIdPut(id, payload)
      await loadStates()
      return true
    } catch (e: any) {
      setError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  /** Удаляет статус (удаление занятого статуса может быть отклонено БД) */
  async function deleteState(id: number): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      await new TimesheetStatesApi(apiConfig()).timesheetStatesIdDelete(id)
      await loadStates()
      return true
    } catch (e: any) {
      setError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  /** Инициализация окна «назад 180 / вперёд 360» */
  async function loadInitialWindow() {
    windowStart.value = shiftDate(todayISO(), -WINDOW_BACK_DAYS)
    windowEnd.value = shiftDate(todayISO(), WINDOW_FORWARD_DAYS)
    await fetchPeriods(windowStart.value, windowEnd.value)
  }

  /** Расширяет загруженное окно под [start, end] и дозагружает только новые диапазоны */
  async function ensureRange(startISO: string, endISO: string) {
    if (startISO < windowStart.value) {
      const from = startISO
      const to = shiftDate(windowStart.value, -1)
      windowStart.value = startISO
      await fetchPeriods(from, to)
    }
    if (endISO > windowEnd.value) {
      const from = shiftDate(windowEnd.value, 1)
      const to = endISO
      windowEnd.value = endISO
      await fetchPeriods(from, to)
    }
  }

  /** Назначает состояние на диапазон дат сотрудника (PUT days, перезаписывает пересечения) */
  async function assignRange(
    employeeId: number,
    stateId: number,
    startDate: string,
    endDate: string,
  ): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const api = new TimesheetEmployeesApi(apiConfig())
      await api.employeesIdDaysPut(employeeId, {
        state_id: stateId,
        start_date: startDate,
        end_date: endDate,
      })
      await fetchPeriods(windowStart.value, windowEnd.value)
      return true
    } catch (e: any) {
      setError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  /** Очищает состояния на диапазоне дат сотрудника (DELETE days; без state_id — все) */
  async function clearRange(
    employeeId: number,
    startDate: string,
    endDate: string,
    stateId?: number,
  ): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const api = new TimesheetEmployeesApi(apiConfig())
      await api.employeesIdDaysDelete(employeeId, startDate, endDate, stateId)
      await fetchPeriods(windowStart.value, windowEnd.value)
      return true
    } catch (e: any) {
      setError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  return {
    employees,
    employeesTotal,
    states,
    periodsByEmployee,
    windowStart,
    windowEnd,
    loading,
    busy,
    error,
    loadEmployees,
    fetchEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    loadStates,
    createState,
    updateState,
    deleteState,
    ensureRange,
    periodFor,
    assignRange,
    clearRange,
  }
})

// === Planning (данные из /planning/* для трёх диаграмм) ===
export const usePlanningStore = defineStore('planning', () => {
  const projectPlanning = ref<any>(null)
  const processPlanning = ref<any>(null)
  const taskPlanning = ref<any>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Общий путь загрузки планирования: silent-режим не трогает loading/error,
   *  чтобы фоновый reload после мутации не сбрасывал видимую ошибку и не показывал спиннер. */
  async function runLoad(silent: boolean, load: () => Promise<unknown>) {
    if (!silent) {
      loading.value = true
      error.value = null
    }
    try {
      await load()
    } catch (e: any) {
      if (!silent) error.value = e.message || String(e)
    } finally {
      if (!silent) loading.value = false
    }
  }

  async function loadProjectPlanning(silent = false) {
    await runLoad(silent, async () => {
      const resp = await new PlanningApi(apiConfig()).planningProjectsGet()
      projectPlanning.value = resp.data?.data ?? null
    })
  }

  async function loadProcessPlanning(silent = false) {
    await runLoad(silent, async () => {
      const resp = await new PlanningApi(apiConfig()).planningProcessesGet()
      processPlanning.value = resp.data?.data ?? null
    })
  }

  async function loadTaskPlanning(silent = false) {
    await runLoad(silent, async () => {
      const resp = await new PlanningApi(apiConfig()).planningTasksGet()
      taskPlanning.value = resp.data?.data ?? null
    })
  }

  /** Сохраняет новые даты бара, затем тихо перезагружает данные (без спиннера).
   *  При ошибке сохранения показывает сообщение и откатывается к серверным данным. */
  async function updateDates(
    save: () => Promise<unknown>,
    reload: (silent: boolean) => Promise<void>,
    id: number,
    start_date: string,
    end_date: string,
  ) {
    let saveError: string | null = null
    try {
      await save()
    } catch (e: any) {
      saveError = e.message || String(e)
    }
    await reload(true)
    if (saveError) error.value = saveError
  }

  async function updateTaskDates(id: number, start_date: string, end_date: string) {
    await updateDates(
      () => new TasksApi(apiConfig()).taskIdPut(id, { start_date, end_date }),
      loadTaskPlanning,
      id,
      start_date,
      end_date,
    )
  }

  async function updateProcessDates(id: number, start_date: string, end_date: string) {
    await updateDates(
      () => new ProcessesApi(apiConfig()).processIdPut(id, { start_date, end_date }),
      loadProcessPlanning,
      id,
      start_date,
      end_date,
    )
  }

  async function updateProjectDates(id: number, start_date: string, end_date: string) {
    await updateDates(
      () => new ProjectsApi(apiConfig()).projectIdPut(id, { start_date, end_date }),
      loadProjectPlanning,
      id,
      start_date,
      end_date,
    )
  }

  /** Сдвиг вехи (одиночная дата): PUT /milestone/{id} + тихая перезагрузка задач */
  async function updateMilestoneDate(id: number, date: string) {
    await updateDates(
      () => new MilestonesApi(apiConfig()).milestoneIdPut(id, { date }),
      loadTaskPlanning,
      id,
      date,
      date,
    )
  }

  /** Общий путь обновления полей (модалка редактирования): PUT + тихий reload;
   *  при ошибке показывает сообщение и возвращает false (модалка остаётся открытой). */
  async function updateMeta(
    save: () => Promise<unknown>,
    reload: (silent: boolean) => Promise<void>,
  ): Promise<boolean> {
    let saveError: string | null = null
    try {
      await save()
    } catch (e: any) {
      saveError = e.message || String(e)
    }
    await reload(true)
    if (saveError) {
      error.value = saveError
      return false
    }
    return true
  }

  async function updateProjectMeta(
    id: number,
    patch: { code?: string; owner_id?: number },
  ): Promise<boolean> {
    return updateMeta(
      () => new ProjectsApi(apiConfig()).projectIdPut(id, patch),
      loadProjectPlanning,
    )
  }

  async function updateProcessMeta(
    id: number,
    patch: { title?: string; owner_id?: number },
  ): Promise<boolean> {
    return updateMeta(
      () => new ProcessesApi(apiConfig()).processIdPut(id, patch),
      loadProcessPlanning,
    )
  }

  async function updateTaskMeta(id: number, patch: { title?: string }): Promise<boolean> {
    return updateMeta(
      () => new TasksApi(apiConfig()).taskIdPut(id, patch),
      loadTaskPlanning,
    )
  }

  async function updateMilestoneMeta(
    id: number,
    patch: { title?: string; content?: string },
  ): Promise<boolean> {
    return updateMeta(
      () => new MilestonesApi(apiConfig()).milestoneIdPut(id, patch),
      loadTaskPlanning,
    )
  }

  /** Общий путь создания: POST; при успехе возвращает created-ответ, иначе null. */
  async function postCreate(create: () => Promise<{ data?: { data?: unknown } }>): Promise<unknown> {
    try {
      const resp = await create()
      return resp.data?.data ?? null
    } catch (e: any) {
      error.value = e.message || String(e)
      return null
    }
  }

  /** Вставка элемента в массив по индексу (сдвиг строк вниз); index по умолчанию — в конец. */
  function insertAt<T>(list: T[] | null | undefined, index: number | undefined, item: T): void {
    if (!list) return
    const i = index == null || index < 0 || index > list.length ? list.length : index
    list.splice(i, 0, item)
  }

  /** Создаёт проект с фиксированным приоритетом 100 — в конец списка */
  async function createProject(
    payload: {
      code: string
      start_date: string
      end_date: string
      priority?: number
    },
  ): Promise<boolean> {
    const created = await postCreate(() =>
      new ProjectsApi(apiConfig()).projectPost({ ...payload, priority: 100 }),
    )
    if (created == null) return false
    const dto = created as {
      id?: number
      code?: string
      start_date?: string
      end_date?: string
      priority?: number
      owner_id?: number
    }

    const item = {
      id: dto.id ?? 0,
      project_code: dto.code ?? payload.code,
      start_date: dto.start_date ?? payload.start_date,
      end_date: dto.end_date ?? payload.end_date,
      priority: dto.priority ?? 100,
      owner_id: dto.owner_id,
    }
    const app = useAppStore()
    insertAt(projectPlanning.value?.projects, undefined, item)
    insertAt(app.projects, undefined, item)
    return true
  }

  async function createProcess(
    payload: {
      title: string
      project_id: number
      start_date: string
      end_date: string
    },
    index?: number,
  ): Promise<boolean> {
    const created = await postCreate(() => new ProcessesApi(apiConfig()).processPost(payload))
    if (created == null) return false
    const dto = created as { id?: number; title?: string; start_date?: string; end_date?: string }
    const project = processPlanning.value?.projects?.find((p: any) => p.id === payload.project_id)
    insertAt(project?.processes, index, {
      id: dto.id ?? 0,
      title: dto.title ?? payload.title,
      start_date: dto.start_date ?? payload.start_date,
      end_date: dto.end_date ?? payload.end_date,
      project_id: payload.project_id,
    })
    return true
  }

  async function createTask(
    payload: {
      title: string
      process_id: number
      start_date: string
      end_date: string
    },
    index?: number,
  ): Promise<boolean> {
    const created = await postCreate(() => new TasksApi(apiConfig()).taskPost(payload))
    if (created == null) return false
    const dto = created as { id?: number; title?: string; start_date?: string; end_date?: string }
    const proc = taskPlanning.value?.processes?.find((p: any) => p.id === payload.process_id)
    insertAt(proc?.tasks, index, {
      id: dto.id ?? 0,
      title: dto.title ?? payload.title,
      start_date: dto.start_date ?? payload.start_date,
      end_date: dto.end_date ?? payload.end_date,
      resources: [],
    })
    return true
  }

  async function createMilestone(payload: {
    title: string
    content?: string
    process_id: number
    date: string
  }): Promise<boolean> {
    const created = await postCreate(() => new MilestonesApi(apiConfig()).milestonePost(payload))
    if (created == null) return false
    const dto = created as { id?: number; title?: string; content?: string; date?: string }
    const proc = taskPlanning.value?.processes?.find((p: any) => p.id === payload.process_id)
    proc?.milestones?.push({
      id: dto.id ?? 0,
      title: dto.title ?? payload.title,
      content: dto.content ?? payload.content ?? '',
      date: dto.date ?? payload.date,
    })
    return true
  }

  /** Удаление элемента из массива по id (no-op, если списка или элемента нет). */
  function removeById<T extends { id?: number }>(list: T[] | null | undefined, id: number): void {
    if (!list) return
    const i = list.findIndex((x) => x.id === id)
    if (i >= 0) list.splice(i, 1)
  }

  /** Общий путь удаления: DELETE по id; true при успехе, иначе false. */
  async function deleteBy(remove: () => Promise<unknown>): Promise<boolean> {
    try {
      await remove()
      return true
    } catch (e: any) {
      error.value = e.message || String(e)
      return false
    }
  }

  async function deleteProject(id: number): Promise<boolean> {
    const ok = await deleteBy(() => new ProjectsApi(apiConfig()).projectIdDelete(id))
    if (!ok) return false
    removeById(projectPlanning.value?.projects, id)
    removeById(useAppStore().projects, id)
    return true
  }

  async function deleteProcess(id: number): Promise<boolean> {
    const ok = await deleteBy(() => new ProcessesApi(apiConfig()).processIdDelete(id))
    if (!ok) return false
    for (const p of processPlanning.value?.projects ?? []) removeById(p.processes, id)
    return true
  }

  async function deleteTask(id: number): Promise<boolean> {
    const ok = await deleteBy(() => new TasksApi(apiConfig()).taskIdDelete(id))
    if (!ok) return false
    for (const p of taskPlanning.value?.processes ?? []) removeById(p.tasks, id)
    return true
  }

  async function deleteMilestone(id: number): Promise<boolean> {
    const ok = await deleteBy(() => new MilestonesApi(apiConfig()).milestoneIdDelete(id))
    if (!ok) return false
    for (const p of taskPlanning.value?.processes ?? []) removeById(p.milestones, id)
    return true
  }

  /** Находит ресурс (из /planning/tasks) задачи по resource_id вместе с assignment_id */
  function findAssigned(taskId: number, resourceId: number) {
    for (const p of taskPlanning.value?.processes ?? []) {
      const t = (p.tasks ?? []).find((x: any) => x.id === taskId)
      if (!t) continue
      return (t.resources ?? []).find((r: any) => r.id === resourceId) as
        | { id?: number; assignment_id?: number }
        | undefined
    }
    return undefined
  }

  /** Назначает ресурс задаче: POST /assignment + тихий reload задач. */
  async function assignResource(
    taskId: number,
    resourceId: number,
    quantity: number,
  ): Promise<boolean> {
    return updateMeta(
      () =>
        new AssignmentsApi(apiConfig()).assignmentPost({
          task_id: taskId,
          resource_id: resourceId,
          quantity,
        }),
      loadTaskPlanning,
    )
  }

  /** Снимает назначение ресурса с задачи: DELETE /assignment/{id} (по assignment_id из
   *  /planning/tasks, иначе падаем на GET /assignment → поиск по (task_id, resource_id)).
   *  При успехе — тихий reload задач. */
  async function removeResource(taskId: number, resourceId: number): Promise<boolean> {
    const found = findAssigned(taskId, resourceId)
    let assignmentId: number | undefined
    if (found?.assignment_id) {
      assignmentId = found.assignment_id
    } else {
      try {
        const resp = await new AssignmentsApi(apiConfig()).assignmentGet(500, undefined, 0)
        const data = resp.data?.data
        const list = data?.items ?? []
        const a = list.find((x: any) => x.task_id === taskId && x.resource_id === resourceId)
        if (a?.id == null) {
          error.value = 'Назначение не найдено'
          return false
        }
        assignmentId = a.id
      } catch (e: any) {
        error.value = e.message || String(e)
        return false
      }
    }
    return updateMeta(() => new AssignmentsApi(apiConfig()).assignmentIdDelete(assignmentId!), loadTaskPlanning)
  }

  /** Переупорядочивает проекты (драг строки): новые приоритеты = index+1, PUT уходят
   *  только для изменившихся — перемещённый проект и сдвинутые между позициями.
   *  При ошибке тихо перезагружаем данные (откат к серверному порядку). */
  async function reorderProjects(from: number, to: number): Promise<boolean> {
    const list = projectPlanning.value?.projects
    if (!Array.isArray(list) || from === to) return true
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return false
    const moved = list.splice(from, 1)[0]
    list.splice(to, 0, moved)

    const changes: { id: number; priority: number }[] = []
    list.forEach((p: any, i: number) => {
      const priority = i + 1
      if (p.priority !== priority) changes.push({ id: p.id, priority })
    })
    if (!changes.length) return true

    let saveError: string | null = null
    try {
      await Promise.all(
        changes.map((c) => new ProjectsApi(apiConfig()).projectIdPut(c.id, { priority: c.priority })),
      )
    } catch (e: any) {
      saveError = e.message || String(e)
    }

    await loadProjectPlanning(true)
    if (saveError) {
      error.value = saveError
      return false
    }

    const appProjects = useAppStore().projects
    if (Array.isArray(appProjects)) {
      for (const p of appProjects) {
        const c = changes.find((x) => x.id === p.id)
        if (c) p.priority = c.priority
      }
    }
    return true
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
    updateTaskDates,
    updateProcessDates,
    updateProjectDates,
    updateMilestoneDate,
    updateProjectMeta,
    updateProcessMeta,
    updateTaskMeta,
    updateMilestoneMeta,
    createProject,
    createProcess,
    createTask,
    createMilestone,
    deleteProject,
    deleteProcess,
    deleteTask,
    deleteMilestone,
    assignResource,
    removeResource,
    reorderProjects,
  }
})
