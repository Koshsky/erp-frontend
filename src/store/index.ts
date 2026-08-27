import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios, { type AxiosError, type Method } from 'axios'
import { AuthApi, ProjectsApi, ProcessesApi, TasksApi, TimesheetResourcesApi, TimesheetCalendarApi, TimesheetStatesApi, PlanningApi, MilestonesApi, UsersApi, AssignmentsApi, AutoCreateApi, RBACApi, PermissionsApi, Configuration } from '@/api'
import type { DtoUserInfo, DtoProject, DtoResourceResponse, DtoResourceCalendar, DtoResourceMemberResponse, DtoResourceAbsenceResponse, DtoUserResponse, DtoUserStateResponse, DtoStateResponse, DtoCreateResourceRequest, DtoUpdateResourceRequest, DtoCreateUserRequest, DtoUpdateUserRequest, DtoSetDaysRequest, DtoAdminUserResponse, DtoCreateUserResult, DtoResetPasswordResponse, DtoAutoCreateConfig, DtoCommentResponse, DomainRole, DtoRuleInput, DtoRuleView, DtoMatrixCell, DtoRoutePolicyView, PoliciesKindInfo, DtoPermission } from '@/api'
import { apiErrorMessage, fullName } from '@/utils'
import { getApiUrl } from '@/config'
import { isOffline } from '@/offline/state'
import { isElectron, setDesktopPassword } from '@/electron'
import { offlineFailFastAdapter } from '@/offline/failFast'
import { scheduleWarmup } from '@/offline/warmup'
import { enqueueMutation, isNetworkError, clearOutbox, type MutationEntity } from '@/offline/outbox'
import { applyRangeSplit } from '@/offline/periodSplit'
import { getAccessToken, setAccessToken } from '@/token'
import { isLoggedOut, clearLoggedOut, setLoggedOut } from '@/loggedOut'
import { getSavedLogin } from '@/syncCredentials'
import { shouldAutoSync } from '@/settings'

const USER_KEY = 'mvs_erp_user'
/** Кеш моих RBAC-прав для офлайн-режима. */
const PERMS_KEY = 'mvs_erp_perms'

/** Сколько времени до истечения токена, когда начинаем проактивный refresh */
const REFRESH_MARGIN_MS = 120 * 1000
const REFRESH_INTERVAL_MS = 30 * 1000

/** Размер страницы листингов (совпадает с дефолтом бэкенда). */
const PAGE_SIZE = 50

/** Временный (отрицательный) id для сущностей, созданных офлайн (уникален во времени) */
function nextTempId(): number {
  return -Date.now()
}

interface MutationOptions {
  call: () => Promise<unknown>
  entity: MutationEntity
  tempId?: number
  /** Штатный путь после успешного ответа сервера (data — полезная часть ответа) */
  apply: (data: any) => void | Promise<void>
  /** Оптимистичный путь при офлайне (запрос уже ушёл в очередь outbox) */
  optimistic: () => void
  onError: (message: string) => void
}

/**
 * Выполняет мутацию с офлайн-поддержкой:
 *  - сеть недоступна (или сетевая ошибка) → запрос сохраняется в очередь
 *    (outbox) и применяется оптимистичное изменение, возвращается true;
 *  - успех онлайн → штатный apply;
 *  - ошибка сервера → false + onError (как было без офлайна).
 *  Авторизация/пароли (/auth/*, changePassword) через этот путь не ходят.
 */
async function runMutation(opts: MutationOptions): Promise<boolean> {
  try {
    const resp = await opts.call()
    await opts.apply((resp as { data?: { data?: unknown } })?.data?.data ?? null)
    return true
  } catch (e: any) {
    const err = e as AxiosError
    if (err?.config && isElectron && isNetworkError(e)) {
      // Офлайн-очередь (outbox) — только в настольной (Electron) сборке.
      // В вебе сетевой сбой мутации — это обычная ошибка (оптимистики нет).
      try {
        await enqueueMutation({
          entity: opts.entity,
          tempId: opts.tempId,
          method: (err.config.method ?? 'get') as Method,
          url: axios.getUri(err.config),
          body: err.config.data,
        })
      } catch {
        opts.onError(e?.message ?? String(e))
        return false
      }
      opts.optimistic()
      return true
    }
    opts.onError(e?.message ?? String(e))
    return false
  }
}

function apiConfig(): Configuration {
  return new Configuration({
    basePath: getApiUrl(),
    baseOptions: {
      headers: { 'Content-Type': 'application/json' },
      // Fail-fast при известном оффлайне (баннер висит): запрос не уходит в
      // сеть и не ждёт таймаута — мутации мгновенно попадают в очередь outbox,
      // GET отдаются из кэша. Адаптер стоит только здесь (клиенты стора), чтобы
      // служебная отправка очереди (flushOutbox, сырой axios) ходила в сеть как
      // обычно: иначе при уже вернувшейся сети записи падали бы с Network Error.
      ...(isElectron && isOffline.value ? { adapter: offlineFailFastAdapter } : {}),
    },
    apiKey: () => `Bearer ${getAccessToken()}`,
  })
}

export { apiConfig }

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
  const exp = decodeTokenExp(getAccessToken())
  if (exp == null) return true
  return exp - Date.now() <= 0
}

/** Не пора ли продлить токен заранее (до истечения меньше запаса) */
function accessTokenExpiring(): boolean {
  const exp = decodeTokenExp(getAccessToken())
  if (exp == null) return true
  return exp - Date.now() <= REFRESH_MARGIN_MS
}

// === Auth ===
export const useAuthStore = defineStore('auth', () => {
  // На старте access-токена в памяти нет; «залогинен» пока есть сохранённый
  // профиль (не секрет). Guard восстановит сессию через /auth/refresh по
  // HttpOnly-куке; если куки нет — refresh вернёт 401 и разлогинит.
  const user = ref<DtoUserInfo | null>(readStoredUser())
  const isAuthenticated = ref<boolean>(Boolean(readStoredUser()))
  const accessExpired = computed<boolean>(() => accessTokenExpired())
  /** Режим сессии: online — реальная (с токеном), offline — локальная без токена */
  const sessionMode = ref<'online' | 'offline'>('online')
  const loading = ref(false)
  const error = ref<string | null>(null)

  function applySession(data: { access_token?: string; user?: DtoUserInfo } | undefined) {
    const token = data?.access_token
    setAccessToken(token ?? null)
    if (data?.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      user.value = data.user
    }
    isAuthenticated.value = Boolean(token)
    sessionMode.value = 'online'
    scheduleProactiveRefresh()
    // Фоновая прогревка офлайн-кэша данными под роль пользователя
    scheduleWarmup()
  }

  /**
   * Офлайн-вход (Desktop, кнопка на /login при isOffline): локальная сессия
   * без токена — данные из кэша, мутации в очередь, сервер не опрашивается.
   * Идентичность: сохранённый профиль (если совпадает с введённым логином
   * или логин не введён), иначе минимальный профиль с введённым логином.
   */
  function enterOffline(username: string | null): boolean {
    const stored = readStoredUser()
    if (stored?.username && (!username || stored.username === username)) {
      user.value = stored
    } else {
      user.value = { username: username ?? undefined } as DtoUserInfo
    }
    setAccessToken(null)
    stopProactiveRefresh()
    isAuthenticated.value = true
    sessionMode.value = 'offline'
    return true
  }

  async function login(username: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const api = new AuthApi(apiConfig())
      const resp = await api.authLoginPost({ username: username.trim(), password })
      const body = resp.data
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
      applySession(body?.data)
      // Ручной вход снимает флаг «вышел» — автосинк снова разрешён
      clearLoggedOut()
      sessionMode.value = 'online'
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
      // Сохранённый для автосинка пароль обновляем, чтобы автосинк не сломался
      // после смены пароля: креды привязаны к последнему ручному входу (Desktop).
      if (isElectron) {
        const saved = getSavedLogin()
        if (saved && user.value?.username && saved === user.value.username) {
          try {
            await setDesktopPassword(newPassword)
          } catch {
            // не критично: автосинк просто попросит ввести креды на логине
          }
        }
      }
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
    // Desktop + автосинк: продление сессии делает session-maintenance
    // (тихий re-login по кредам автосинка) — refresh-кука не работает
    // кросс-сайт, здесь пропускаем, чтобы не уйти в logout при 401.
    const renew = () => {
      if (accessTokenExpiring() && !(isElectron && shouldAutoSync())) {
        void refreshSession()
      }
    }
    proactiveTimer = window.setInterval(renew, REFRESH_INTERVAL_MS)
    onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && accessTokenExpiring() && !(isElectron && shouldAutoSync())) {
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
    // Refresh-токен живёт в HttpOnly-куке (AD-05): тело не шлём, кука приложится сама.
    // Офлайн refresh не выполнить: не разлогиниваем, сессия живёт до возврата сети.
    if (isOffline.value) return true
    // После явного выхода (logout) не дёргаем /auth/refresh: кука уже отозвана,
    // запрос вернёт 401 и покажет ложное «Сессия истекла», а на сервере повторное
    // использование отозванного токена сработает как reuse-детект (отзыв всех
    // сессий пользователя). Возвращаем false без сети — вызывающий разлогинен.
    if (isLoggedOut()) return false
    loading.value = true
    error.value = null
    try {
      const api = new AuthApi(apiConfig())
      const resp = await api.authRefreshPost()
      const body = resp.data
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
      applySession(body?.data)
      return true
    } catch (e: any) {
      // Сетевая ошибка (нет HTTP-ответа): сервер недоступен. Не разлогиниваем.
      // В desktop-сборке уходим в офлайн-режим (сессия и очередь изменений в
      // IndexedDB живут до возврата сети); в вебе офлайна нет — просто не
      // выкидываем пользователя. Разлогин — только при реальном отказе сервера.
      if (isNetworkError(e)) {
        if (isElectron) isOffline.value = true
        return true
      }
      error.value = e.message || String(e)
      logout()
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    stopProactiveRefresh()
    // Не даём очереди уйти под новым пользователем/токеном
    void clearOutbox()
    // Отзываем refresh-сессию на сервере и снимаем куку (best-effort)
    try {
      void new AuthApi(apiConfig()).authLogoutPost()
    } catch {
      // кука очистится и на клиенте ниже
    }
    setAccessToken(null)
    localStorage.removeItem(USER_KEY)
    user.value = null
    isAuthenticated.value = false
    sessionMode.value = 'online'
    // После явного выхода автосинк не входит до ручного входа (Desktop)
    setLoggedOut()
  }

  /** Получает свежие данные пользователя по id через UsersApi.usersIdGet */
  async function fetchProfile(userId: number) {
    if (isOffline.value && user.value) return true
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
  if (isAuthenticated.value) {
    scheduleProactiveRefresh()
    scheduleWarmup()
  }

  return {
    user,
    isAuthenticated,
    accessExpired,
    sessionMode,
    loading,
    error,
    login,
    enterOffline,
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
    // Проекты видят только admin/dp/rp (по RBAC-матрице). Для остальных ролей
    // листинг запрещён бэкендом (403) — не отправляем запрос вовсе.
    const role = useAuthStore().user?.role
    if (role && role !== 'admin' && role !== 'dp' && role !== 'rp') {
      projects.value = []
      projectsTotal.value = 0
      return
    }
    if (isOffline.value && projects.value.length) return
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
    if (isOffline.value && resources.value.length) return
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
    const tempId = nextTempId()
    return runMutation({
      entity: 'resource',
      tempId,
      call: async () => {
        const resp = await new TimesheetResourcesApi(apiConfig()).resourcesPost(payload)
        const errBody = resp.data?.error as { code?: unknown; message?: string } | undefined
        if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
        return resp
      },
      apply: (data) => {
        if (data) resources.value.push(data)
      },
      optimistic: () => {
        resources.value.push({ id: tempId, ...payload } as unknown as DtoResourceResponse)
      },
      onError: (m) => {
        resourcesError.value = m
      },
    })
  }

  async function updateResource(id: number, patch: DtoUpdateResourceRequest): Promise<boolean> {
    resourcesError.value = null
    return runMutation({
      entity: 'resource',
      call: async () => {
        const resp = await new TimesheetResourcesApi(apiConfig()).resourcesIdPut(id, patch)
        const errBody = resp.data?.error as { code?: unknown; message?: string } | undefined
        if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
        return resp
      },
      apply: (updated) => {
        if (!updated) return
        const i = resources.value.findIndex((r) => r.id === id)
        if (i >= 0) resources.value[i] = updated
      },
      optimistic: () => {
        const i = resources.value.findIndex((r) => r.id === id)
        if (i >= 0) resources.value[i] = { ...resources.value[i], ...patch }
      },
      onError: (m) => {
        resourcesError.value = m
      },
    })
  }

  async function deleteResource(id: number): Promise<boolean> {
    resourcesError.value = null
    const remove = () => {
      const i = resources.value.findIndex((r) => r.id === id)
      if (i >= 0) resources.value.splice(i, 1)
    }
    return runMutation({
      entity: 'resource',
      call: () => new TimesheetResourcesApi(apiConfig()).resourcesIdDelete(id),
      apply: remove,
      optimistic: remove,
      onError: (m) => {
        resourcesError.value = m
      },
    })
  }

  // === Пользователи ресурса (/resources/{id}/members) ===
  const resourceMembers = ref<Record<number, DtoResourceMemberResponse[]>>({})

  /** Загружает список участников (пользователей) ресурса */
  async function loadResourceMembers(resourceId: number) {
    if (isOffline.value && resourceMembers.value[resourceId]?.length) return
    try {
      const api = new TimesheetResourcesApi(apiConfig())
      const resp = await api.resourcesIdMembersGet(resourceId)
      resourceMembers.value[resourceId] = resp.data?.data ?? []
    } catch (e: any) {
      resourcesError.value = e.message || String(e)
    }
  }

  /** Добавляет пользователя в ресурс (POST members); участник — любой пользователь */
  async function addResourceMember(resourceId: number, userId: number): Promise<boolean> {
    resourcesError.value = null
    const tempId = nextTempId()
    return runMutation({
      entity: 'member',
      tempId,
      call: () => new TimesheetResourcesApi(apiConfig()).resourcesIdMembersPost(resourceId, {
        user_id: userId,
      }),
      apply: async () => {
        await loadResourceMembers(resourceId)
        await loadResources()
      },
      optimistic: () => {
        const list = resourceMembers.value[resourceId] ?? []
        const w = useTimesheetStore().employees.find((e) => e.id === userId)
        if (!list.some((m) => m.id === userId)) {
          list.push({
            id: userId,
            name: w?.name ?? `#${userId}`,
            role: 'worker',
            position: w?.position,
            manager_id: w?.manager_id,
            hire_date: w?.hire_date,
            termination_date: w?.termination_date,
          })
        }
        resourceMembers.value[resourceId] = list
      },
      onError: (m) => {
        resourcesError.value = m
      },
    })
  }

  /** Убирает пользователя из ресурса (DELETE members/{userId}) */
  async function removeResourceMember(resourceId: number, userId: number): Promise<boolean> {
    resourcesError.value = null
    const remove = () => {
      const list = resourceMembers.value[resourceId]
      if (!list) return
      resourceMembers.value[resourceId] = list.filter((m) => m.id !== userId)
    }
    return runMutation({
      entity: 'member',
      call: () => new TimesheetResourcesApi(apiConfig()).resourcesIdMembersUserIdDelete(resourceId, userId),
      apply: async () => {
        remove()
        await loadResources()
      },
      optimistic: remove,
      onError: (m) => {
        resourcesError.value = m
      },
    })
  }

  /** Обратная карта «пользователь → его ресурс» (членство уникально: UNIQUE(user_id)) */
  const resourceByUser = computed<Record<number, DtoResourceResponse>>(() => {
    const map: Record<number, DtoResourceResponse> = {}
    for (const res of resources.value) {
      if (res.id == null) continue
      for (const m of resourceMembers.value[res.id] ?? []) {
        if (m.id != null) map[m.id] = res
      }
    }
    return map
  })

  /**
   * Гарантирует загрузку ресурсов и их участников — для бейджей ресурса и
   * фильтра на странице «Сотрудники». При force=true участники перезагружаются
   * всегда (чтобы бейджи отражали актуальное членство после изменений на
   * странице «Ресурсы»), иначе — только недостающие.
   */
  async function ensureResourceMembers(force = false) {
    if (isOffline.value && resources.value.length) return
    if (!resources.value.length) await loadResources()
    for (const res of resources.value) {
      if (res.id == null) continue
      if (force || resourceMembers.value[res.id] == null) {
        await loadResourceMembers(res.id)
      }
    }
  }

  /**
   * Меняет ресурс сотрудника: открепление от fromResourceId, прикрепление к
   * toResourceId (null — сотрудник без ресурса). Возвращает false и кладёт
   * сообщение в resourcesError при отказе (например, 403 на чужой ресурс).
   */
  async function changeEmployeeResource(
    userId: number,
    fromResourceId: number | null,
    toResourceId: number | null,
  ): Promise<boolean> {
    if (fromResourceId === toResourceId) return true
    if (fromResourceId != null) {
      const ok = await removeResourceMember(fromResourceId, userId)
      if (!ok) return false
    }
    if (toResourceId != null) {
      const ok = await addResourceMember(toResourceId, userId)
      if (!ok) return false
    }
    return true
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
    if (isOffline.value && calendar.value.length) return
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

  // === Отсутствия членов ресурсов (/resources/{id}/absence) для тултипа UsageCell ===
  const absenceByResource = ref<Record<number, DtoResourceAbsenceResponse[]>>({})

  /** Загружает отсутствия (недоступные состояния) членов ресурса за окно */
  async function loadResourceAbsence(resourceId: number, from: string, to: string) {
    try {
      const api = new TimesheetResourcesApi(apiConfig())
      const resp = await api.resourcesIdAbsenceGet(resourceId, from, to)
      absenceByResource.value = { ...absenceByResource.value, [resourceId]: resp.data?.data ?? [] }
    } catch {
      // Пропускаем: тултип просто не покажет отсутствующих на этом ресурсе.
    }
  }

  const users = ref<DtoUserInfo[]>([])
  const usersLoading = ref(false)
  const usersError = ref<string | null>(null)

  /** Прямые подчинённые текущего пользователя (скоуп /users): «свои сотрудники».
   *  Для vp — только пользователи с manager_id = текущий пользователь; для admin — все.
   *  Используется как пул кандидатов в «ответственные» задач. */
  const myStaff = ref<DtoUserResponse[]>([])
  const myStaffLoading = ref(false)

  async function loadUsers() {
    if (isOffline.value && users.value.length) return
    usersLoading.value = true
    usersError.value = null
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userAllGet()
      users.value = resp.data?.data ?? []
    } catch (e: any) {
      usersError.value = e.message || String(e)
    } finally {
      usersLoading.value = false
    }
  }

  /** Загружает «свой персонал» (скоупированный /users без фильтра роли). */
  async function loadMyStaff() {
    if (isOffline.value && myStaff.value.length) return
    myStaffLoading.value = true
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userGet(500, undefined, undefined, undefined, 0)
      myStaff.value = resp.data?.data?.items ?? []
    } catch {
      // Не критично: пул кандидатов остаётся прежним.
    } finally {
      myStaffLoading.value = false
    }
  }

  // === Админ: пользователи (все роли, с хешем пароля) ===
  const adminUsers = ref<DtoAdminUserResponse[]>([])
  const adminUsersLoading = ref(false)
  const adminUsersError = ref<string | null>(null)

  /** Полный список пользователей для админ-страницы (включает password_hash) */
  async function loadAdminUsers(includeHash = true) {
    adminUsersLoading.value = true
    adminUsersError.value = null
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userGet(500, undefined, undefined, includeHash, 0)
      adminUsers.value = resp.data?.data?.items ?? []
    } catch (e: any) {
      adminUsersError.value = apiErrorMessage(e)
    } finally {
      adminUsersLoading.value = false
    }
  }

  /** Создать пользователя; возвращает сгенерированный пароль (если есть) */
  async function createUser(payload: DtoCreateUserRequest): Promise<DtoCreateUserResult | null> {
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userPost(payload)
      await loadAdminUsers()
      return resp.data?.data ?? null
    } catch (e: any) {
      adminUsersError.value = apiErrorMessage(e)
      return null
    }
  }

  /** Сбросить пароль пользователя; возвращает новый пароль (показать один раз) */
  async function resetPassword(id: number): Promise<string | null> {
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userIdResetPasswordPost(id)
      return resp.data?.data?.password ?? null
    } catch (e: any) {
      adminUsersError.value = apiErrorMessage(e)
      return null
    }
  }

  /** Обновить пользователя (роль/менеджер/профиль) */
  async function updateUser(id: number, patch: DtoUpdateUserRequest): Promise<boolean> {
    try {
      const api = new UsersApi(apiConfig())
      await api.userIdPut(id, patch)
      await loadAdminUsers()
      return true
    } catch (e: any) {
      adminUsersError.value = apiErrorMessage(e)
      return false
    }
  }

  /** Задать/сбросить руководителя пользователя (manager_id: null — без руководителя) */
  async function updateManager(id: number, managerId: number | null): Promise<boolean> {
    try {
      const api = new UsersApi(apiConfig())
      await api.userIdManagerPut(id, { manager_id: managerId ?? undefined })
      await loadAdminUsers()
      return true
    } catch (e: any) {
      adminUsersError.value = apiErrorMessage(e)
      return false
    }
  }

  // === Админ: автосоздание проектов ===
  const autoCreateConfig = ref<DtoAutoCreateConfig | null>(null)
  const autoCreateLoading = ref(false)
  const autoCreateError = ref<string | null>(null)

  /** Загрузить конфигурацию автосоздания */
  async function loadAutoCreateConfig() {
    autoCreateLoading.value = true
    autoCreateError.value = null
    try {
      const api = new AutoCreateApi(apiConfig())
      const resp = await api.autoCreateConfigGet()
      autoCreateConfig.value = resp.data?.data ?? null
    } catch (e: any) {
      autoCreateError.value = apiErrorMessage(e)
    } finally {
      autoCreateLoading.value = false
    }
  }

  /** Сохранить конфигурацию автосоздания (целая замена) */
  async function saveAutoCreateConfig(cfg: DtoAutoCreateConfig): Promise<boolean> {
    try {
      const api = new AutoCreateApi(apiConfig())
      await api.autoCreateConfigPut(cfg)
      autoCreateConfig.value = cfg
      return true
    } catch (e: any) {
      autoCreateError.value = apiErrorMessage(e)
      return false
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
    absenceByResource,
    loadResourceAbsence,
    loadUsers,
    myStaff,
    myStaffLoading,
    loadMyStaff,
    adminUsers,
    adminUsersLoading,
    adminUsersError,
    loadAdminUsers,
    createUser,
    resetPassword,
    updateUser,
    updateManager,
    autoCreateConfig,
    autoCreateLoading,
    autoCreateError,
    loadAutoCreateConfig,
    saveAutoCreateConfig,
    createResource,
    updateResource,
    deleteResource,
    resourceMembers,
    loadResourceMembers,
    addResourceMember,
    removeResourceMember,
    resourceByUser,
    ensureResourceMembers,
    changeEmployeeResource,
  }
})

// === Табель (состояния сотрудников, страница для vp/admin) ===
export const useTimesheetStore = defineStore('timesheet', () => {
  const app = useAppStore()
  const auth = useAuthStore()

  // Окно загрузки состояний: по умолчанию «назад 180 / вперёд 360 дней»; при
  // инфинит-скролле шкалы расширяется через ensureRange (дозагрузка новых диапазонов).
  const WINDOW_BACK_DAYS = 180
  const WINDOW_FORWARD_DAYS = 360

  const employees = ref<DtoUserResponse[]>([])
  const employeesTotal = ref(0)
  const states = ref<DtoStateResponse[]>([])
  const periodsByEmployee = ref<Record<number, DtoUserStateResponse[]>>({})
  const windowStart = ref('')
  const windowEnd = ref('')
  const loading = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)

  /** Сотрудники (пользователи с ролью worker), отсортированные по ФИО */
  const employeesWithTitles = computed<DtoUserResponse[]>(() =>
    [...employees.value].sort(
      (a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', 'ru') ||
        (a.position || '').localeCompare(b.position || '', 'ru'),
    ),
  )

  /** Текущий пользователь как строка табеля («себя» видит каждый) */
  const selfEmployee = computed<DtoUserResponse | null>(() => {
    const u = auth.user
    if (u?.id == null) return null
    return { id: u.id, name: u.name ?? '', username: u.username, role: u.role, position: '' }
  })

  /** Строки табеля: сам пользователь + его прямые подчинённые */
  const timesheetRows = computed<DtoUserResponse[]>(() => {
    const rows = [...employeesWithTitles.value]
    if (selfEmployee.value) rows.unshift(selfEmployee.value)
    return rows
  })

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

  /** Загружает состояния (включая самого пользователя) за [start, end] и мёржит в кэш по id */
  async function fetchPeriods(start: string, end: string) {
    const api = new UsersApi(apiConfig())
    const results = await Promise.all(
      timesheetRows.value.map((emp) =>
        api
          .userIdDaysGet(emp.id ?? 0, start, end)
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
      // Свежий ответ за окно [start, end] авторитетен для периодов, пересекающих окно:
      // старые пересекающиеся периоды (например, сброшенные через DELETE) удаляем,
      // затем мёржим новые. Периоды вне окна сохраняются для инкрементальной дозагрузки.
      const kept = existing.filter(
        (p) =>
          !(p.start_date != null && p.end_date != null && !(p.end_date < start || p.start_date > end)),
      )
      const byId = new Map<number, DtoUserStateResponse>()
      for (const p of kept) if (p.id != null) byId.set(p.id, p)
      for (const p of list) if (p.id != null) byId.set(p.id, p)
      periodsByEmployee.value[id] = [...byId.values()].sort((a, b) =>
        (a.start_date ?? '').localeCompare(b.start_date ?? ''),
      )
    }
  }

  /** Период сотрудника, покрывающий день (бинарный поиск по отсортированным периодам) */
  function periodFor(employeeId: number, iso: string): DtoUserStateResponse | undefined {
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

  /** Загружает список сотрудников (users с ролью worker; vp видит подчинённых, admin — всех) */
  async function fetchEmployees(managerId?: number) {
    if (isOffline.value && employees.value.length) return
    loading.value = true
    error.value = null
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userGet(PAGE_SIZE, 'worker', managerId ?? undefined, undefined, 0)
      const data = resp.data?.data
      // Сортировку добавляет computed employeesWithTitles.
      employees.value = data?.items ?? []
      employeesTotal.value = data?.total ?? 0
    } catch (e: any) {
      setError(e)
    } finally {
      loading.value = false
    }
  }

  /** Загружает сотрудников и инициализирует окно состояний (для табеля) */
  async function loadEmployees() {
    if (isOffline.value && employees.value.length) return
    periodsByEmployee.value = {}
    await fetchEmployees()
    await loadInitialWindow()
  }

  /** Поля запроса создания/изменения сотрудника (пользователь с ролью worker) */
  interface EmployeePayload {
    last_name: string
    first_name: string
    middle_name?: string
    role?: string
    position?: string
    manager_id?: number
    hire_date?: string
    termination_date?: string
  }

  /** Создаёт сотрудника (worker); для vp manager принудительно = текущему пользователю */
  async function createEmployee(payload: EmployeePayload): Promise<boolean> {
    busy.value = true
    error.value = null
    const tempId = nextTempId()
    try {
      return await runMutation({
        entity: 'user',
        tempId,
        call: () => {
          const req: DtoCreateUserRequest = { ...payload, role: 'worker' }
          return new UsersApi(apiConfig()).userPost(req)
        },
        apply: async () => {
          await fetchEmployees()
        },
        optimistic: () => {
          employees.value.push({
            id: tempId,
            ...payload,
            role: 'worker',
            name: fullName(payload),
          } as unknown as DtoUserResponse)
        },
        onError: (m) => {
          error.value = m
        },
      })
    } finally {
      busy.value = false
    }
  }

  /** Изменяет сотрудника; для vp manager принудительно = текущему пользователю */
  async function updateEmployee(id: number, payload: EmployeePayload): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      return await runMutation({
        entity: 'user',
        call: () => new UsersApi(apiConfig()).userIdPut(id, payload as DtoUpdateUserRequest),
        apply: async () => {
          await fetchEmployees()
        },
        optimistic: () => {
          const i = employees.value.findIndex((e) => e.id === id)
          if (i >= 0) employees.value[i] = { ...employees.value[i], ...payload }
        },
        onError: (m) => {
          error.value = m
        },
      })
    } finally {
      busy.value = false
    }
  }

  /** Удаляет сотрудника (мягкое удаление) */
  async function deleteEmployee(id: number): Promise<boolean> {
    busy.value = true
    error.value = null
    const remove = () => {
      const i = employees.value.findIndex((e) => e.id === id)
      if (i >= 0) employees.value.splice(i, 1)
      delete periodsByEmployee.value[id]
    }
    try {
      return await runMutation({
        entity: 'user',
        call: () => new UsersApi(apiConfig()).userIdDelete(id),
        apply: async () => {
          await fetchEmployees()
        },
        optimistic: remove,
        onError: (m) => {
          error.value = m
        },
      })
    } finally {
      busy.value = false
    }
  }

  /** Загружает справочник состояний */
  async function loadStates() {
    if (isOffline.value && states.value.length) return
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
    const tempId = nextTempId()
    try {
      return await runMutation({
        entity: 'state',
        tempId,
        call: () => new TimesheetStatesApi(apiConfig()).timesheetStatesPost(payload),
        apply: async () => {
          await loadStates()
        },
        optimistic: () => {
          states.value.push({ id: tempId, ...payload } as unknown as DtoStateResponse)
        },
        onError: (m) => {
          error.value = m
        },
      })
    } finally {
      busy.value = false
    }
  }

  /** Изменяет статус и обновляет справочник */
  async function updateState(id: number, payload: StatePayload): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      return await runMutation({
        entity: 'state',
        call: () => new TimesheetStatesApi(apiConfig()).timesheetStatesIdPut(id, payload),
        apply: async () => {
          await loadStates()
        },
        optimistic: () => {
          const i = states.value.findIndex((s) => s.id === id)
          if (i >= 0) states.value[i] = { ...states.value[i], ...payload }
        },
        onError: (m) => {
          error.value = m
        },
      })
    } finally {
      busy.value = false
    }
  }

  /** Удаляет статус (удаление занятого статуса может быть отклонено БД) */
  async function deleteState(id: number): Promise<boolean> {
    busy.value = true
    error.value = null
    const remove = () => {
      const i = states.value.findIndex((s) => s.id === id)
      if (i >= 0) states.value.splice(i, 1)
    }
    try {
      return await runMutation({
        entity: 'state',
        call: () => new TimesheetStatesApi(apiConfig()).timesheetStatesIdDelete(id),
        apply: async () => {
          await loadStates()
        },
        optimistic: remove,
        onError: (m) => {
          error.value = m
        },
      })
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
      const body: DtoSetDaysRequest = {
        state_id: stateId,
        start_date: startDate,
        end_date: endDate,
      }
      return await runMutation({
        entity: 'period',
        call: () => new UsersApi(apiConfig()).userIdDaysPut(employeeId, body),
        apply: async () => {
          await fetchPeriods(windowStart.value, windowEnd.value)
        },
        optimistic: () => {
          const existing = periodsByEmployee.value[employeeId] ?? []
          // Поля статуса нужны для цвета и аббревиатуры ячейки офлайн
          const st = states.value.find((s) => s.id === stateId)
          // Разбиение как на бэкенде: вычитаем [startDate, endDate], хвосты
          // пересекающихся диапазонов сохраняются, старый диапазон не исчезает.
          periodsByEmployee.value[employeeId] = applyRangeSplit(existing, 'put', startDate, endDate, undefined, {
            id: nextTempId(),
            state_id: stateId,
            state_code: st?.code,
            state_name: st?.name,
            is_available: st?.is_available,
          })
        },
        onError: (m) => {
          error.value = m
        },
      })
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
      return await runMutation({
        entity: 'period',
        call: () =>
          new UsersApi(apiConfig()).userIdDaysDelete(
            employeeId,
            startDate,
            endDate,
            stateId,
          ),
        apply: async () => {
          await fetchPeriods(windowStart.value, windowEnd.value)
        },
        optimistic: () => {
          const existing = periodsByEmployee.value[employeeId] ?? []
          // Как бэкенд DeleteStateRange: вычитаем диапазон из пересекающихся
          // интервалов (хвосты сохраняются); при stateId — только его состояния.
          periodsByEmployee.value[employeeId] = applyRangeSplit(
            existing,
            'delete',
            startDate,
            endDate,
            stateId,
          )
        },
        onError: (m) => {
          error.value = m
        },
      })
    } finally {
      busy.value = false
    }
  }

  return {
    employees,
    employeesWithTitles,
    timesheetRows,
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

  // === Комментарии задач (цепочки обсуждений) ===
  // Кэш по задаче; в офлайне отдаётся последний загруженный список (online-only).
  const commentsByTask = ref<Record<number, DtoCommentResponse[]>>({})
  const commentsLoading = ref(false)
  const commentsError = ref<string | null>(null)

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
    if (isOffline.value && projectPlanning.value) return
    await runLoad(silent, async () => {
      const resp = await new PlanningApi(apiConfig()).planningProjectsGet()
      projectPlanning.value = resp.data?.data ?? null
    })
  }

  async function loadProcessPlanning(silent = false) {
    if (isOffline.value && processPlanning.value) return
    await runLoad(silent, async () => {
      const resp = await new PlanningApi(apiConfig()).planningProcessesGet()
      processPlanning.value = resp.data?.data ?? null
    })
  }

  async function loadTaskPlanning(silent = false) {
    if (isOffline.value && taskPlanning.value) return
    await runLoad(silent, async () => {
      const resp = await new PlanningApi(apiConfig()).planningTasksGet()
      taskPlanning.value = resp.data?.data ?? null
    })
  }

  /** Сохраняет новые даты бара, затем тихо перезагружает данные (без спиннера).
   *  При ошибке сохранения показывает сообщение и откатывается к серверным данным. */
  function findProjectRow(id: number): any {
    return projectPlanning.value?.projects?.find((p: any) => p.id === id)
  }

  function findProcessRow(id: number): any {
    for (const p of processPlanning.value?.projects ?? []) {
      const pr = (p.processes ?? []).find((x: any) => x.id === id)
      if (pr) return pr
    }
    return undefined
  }

  function findTaskRow(id: number): any {
    for (const p of taskPlanning.value?.processes ?? []) {
      const t = (p.tasks ?? []).find((x: any) => x.id === id)
      if (t) return t
    }
    return undefined
  }

  function findMilestoneRow(id: number): any {
    for (const p of taskPlanning.value?.processes ?? []) {
      const m = (p.milestones ?? []).find((x: any) => x.id === id)
      if (m) return m
    }
    return undefined
  }

  /** Сдвиг дат бара: PUT дат + тихий reload (онлайн) / локальная правка (офлайн) */
  async function updateTaskDates(id: number, start_date: string, end_date: string): Promise<boolean> {
    return runMutation({
      entity: 'task',
      call: () => new TasksApi(apiConfig()).taskIdPut(id, { start_date, end_date }),
      apply: async () => {
        await loadTaskPlanning(true)
      },
      optimistic: () => {
        const t = findTaskRow(id)
        if (t) Object.assign(t, { start_date, end_date })
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function updateProcessDates(id: number, start_date: string, end_date: string): Promise<boolean> {
    return runMutation({
      entity: 'process',
      call: () => new ProcessesApi(apiConfig()).processIdPut(id, { start_date, end_date }),
      apply: async () => {
        await loadProcessPlanning(true)
      },
      optimistic: () => {
        const pr = findProcessRow(id)
        if (pr) Object.assign(pr, { start_date, end_date })
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function updateProjectDates(id: number, start_date: string, end_date: string): Promise<boolean> {
    return runMutation({
      entity: 'project',
      call: () => new ProjectsApi(apiConfig()).projectIdPut(id, { start_date, end_date }),
      apply: async () => {
        await loadProjectPlanning(true)
      },
      optimistic: () => {
        const p = findProjectRow(id)
        if (p) Object.assign(p, { start_date, end_date })
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  /** Сдвиг вехи (одиночная дата): PUT /milestone/{id} + тихая перезагрузка задач */
  async function updateMilestoneDate(id: number, date: string): Promise<boolean> {
    return runMutation({
      entity: 'milestone',
      call: () => new MilestonesApi(apiConfig()).milestoneIdPut(id, { date }),
      apply: async () => {
        await loadTaskPlanning(true)
      },
      optimistic: () => {
        const m = findMilestoneRow(id)
        if (m) m.date = date
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function updateProjectMeta(
    id: number,
    patch: { code?: string; owner_id?: number },
  ): Promise<boolean> {
    return runMutation({
      entity: 'project',
      call: () => new ProjectsApi(apiConfig()).projectIdPut(id, patch),
      apply: async () => {
        await loadProjectPlanning(true)
      },
      optimistic: () => {
        const p = findProjectRow(id)
        if (p) Object.assign(p, patch)
        const ap = useAppStore().projects.find((x) => x.id === id)
        if (ap) Object.assign(ap, patch)
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function updateProcessMeta(
    id: number,
    patch: { title?: string; owner_id?: number },
  ): Promise<boolean> {
    return runMutation({
      entity: 'process',
      call: () => new ProcessesApi(apiConfig()).processIdPut(id, patch),
      apply: async () => {
        await loadProcessPlanning(true)
      },
      optimistic: () => {
        const pr = findProcessRow(id)
        if (pr) Object.assign(pr, patch)
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function updateTaskMeta(id: number, patch: { title?: string; owner_id?: number }): Promise<boolean> {
    return runMutation({
      entity: 'task',
      call: () => new TasksApi(apiConfig()).taskIdPut(id, patch),
      apply: async () => {
        await loadTaskPlanning(true)
      },
      optimistic: () => {
        const t = findTaskRow(id)
        if (t) Object.assign(t, patch)
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function updateMilestoneMeta(
    id: number,
    patch: { title?: string; content?: string },
  ): Promise<boolean> {
    return runMutation({
      entity: 'milestone',
      call: () => new MilestonesApi(apiConfig()).milestoneIdPut(id, patch),
      apply: async () => {
        await loadTaskPlanning(true)
      },
      optimistic: () => {
        const m = findMilestoneRow(id)
        if (m) Object.assign(m, patch)
      },
      onError: (m) => {
        error.value = m
      },
    })
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
    const tempId = nextTempId()
    return runMutation({
      entity: 'project',
      tempId,
      call: async () => {
        const resp = await new ProjectsApi(apiConfig()).projectPost({ ...payload, priority: 100 })
        const errBody = resp.data?.error as { code?: unknown; message?: string } | undefined
        if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
        return resp
      },
      apply: (dto) => {
        if (!dto) return
        const d = dto as {
          id?: number
          code?: string
          start_date?: string
          end_date?: string
          priority?: number
          owner_id?: number
        }
        const item = {
          id: d.id ?? 0,
          project_code: d.code ?? payload.code,
          start_date: d.start_date ?? payload.start_date,
          end_date: d.end_date ?? payload.end_date,
          priority: d.priority ?? 100,
          owner_id: d.owner_id,
        }
        const app = useAppStore()
        insertAt(projectPlanning.value?.projects, undefined, item)
        insertAt(app.projects, undefined, item)
      },
      optimistic: () => {
        const item = {
          id: tempId,
          project_code: payload.code,
          start_date: payload.start_date,
          end_date: payload.end_date,
          priority: payload.priority ?? 100,
          owner_id: undefined,
        }
        const app = useAppStore()
        insertAt(projectPlanning.value?.projects, undefined, item)
        insertAt(app.projects, undefined, item)
      },
      onError: (m) => {
        error.value = m
      },
    })
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
    const tempId = nextTempId()
    return runMutation({
      entity: 'process',
      tempId,
      call: async () => {
        const resp = await new ProcessesApi(apiConfig()).processPost(payload)
        const errBody = resp.data?.error as { code?: unknown; message?: string } | undefined
        if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
        return resp
      },
      apply: (dto) => {
        if (!dto) return
        const d = dto as { id?: number; title?: string; start_date?: string; end_date?: string }
        const project = processPlanning.value?.projects?.find((p: any) => p.id === payload.project_id)
        insertAt(project?.processes, index, {
          id: d.id ?? 0,
          title: d.title ?? payload.title,
          start_date: d.start_date ?? payload.start_date,
          end_date: d.end_date ?? payload.end_date,
          project_id: payload.project_id,
        })
      },
      optimistic: () => {
        const project = processPlanning.value?.projects?.find((p: any) => p.id === payload.project_id)
        insertAt(project?.processes, index, {
          id: tempId,
          title: payload.title,
          start_date: payload.start_date,
          end_date: payload.end_date,
          project_id: payload.project_id,
        })
      },
      onError: (m) => {
        error.value = m
      },
    })
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
    const tempId = nextTempId()
    return runMutation({
      entity: 'task',
      tempId,
      call: async () => {
        const resp = await new TasksApi(apiConfig()).taskPost(payload)
        const errBody = resp.data?.error as { code?: unknown; message?: string } | undefined
        if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
        return resp
      },
      apply: (dto) => {
        if (!dto) return
        const d = dto as { id?: number; title?: string; start_date?: string; end_date?: string }
        const proc = taskPlanning.value?.processes?.find((p: any) => p.id === payload.process_id)
        insertAt(proc?.tasks, index, {
          id: d.id ?? 0,
          title: d.title ?? payload.title,
          start_date: d.start_date ?? payload.start_date,
          end_date: d.end_date ?? payload.end_date,
          resources: [],
        })
      },
      optimistic: () => {
        const proc = taskPlanning.value?.processes?.find((p: any) => p.id === payload.process_id)
        insertAt(proc?.tasks, index, {
          id: tempId,
          title: payload.title,
          start_date: payload.start_date,
          end_date: payload.end_date,
          resources: [],
        })
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function createMilestone(payload: {
    title: string
    content?: string
    process_id: number
    date: string
  }): Promise<boolean> {
    const tempId = nextTempId()
    return runMutation({
      entity: 'milestone',
      tempId,
      call: async () => {
        const resp = await new MilestonesApi(apiConfig()).milestonePost(payload)
        const errBody = resp.data?.error as { code?: unknown; message?: string } | undefined
        if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
        return resp
      },
      apply: (dto) => {
        if (!dto) return
        const d = dto as { id?: number; title?: string; content?: string; date?: string }
        const proc = taskPlanning.value?.processes?.find((p: any) => p.id === payload.process_id)
        proc?.milestones?.push({
          id: d.id ?? 0,
          title: d.title ?? payload.title,
          content: d.content ?? payload.content ?? '',
          date: d.date ?? payload.date,
        })
      },
      optimistic: () => {
        const proc = taskPlanning.value?.processes?.find((p: any) => p.id === payload.process_id)
        proc?.milestones?.push({
          id: tempId,
          title: payload.title,
          content: payload.content ?? '',
          date: payload.date,
        })
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  /** Удаление элемента из массива по id (no-op, если списка или элемента нет). */
  function removeById<T extends { id?: number }>(list: T[] | null | undefined, id: number): void {
    if (!list) return
    const i = list.findIndex((x) => x.id === id)
    if (i >= 0) list.splice(i, 1)
  }

  async function deleteProject(id: number): Promise<boolean> {
    const remove = () => {
      removeById(projectPlanning.value?.projects, id)
      removeById(useAppStore().projects, id)
    }
    return runMutation({
      entity: 'project',
      call: () => new ProjectsApi(apiConfig()).projectIdDelete(id),
      apply: remove,
      optimistic: remove,
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function deleteProcess(id: number): Promise<boolean> {
    const remove = () => {
      for (const p of processPlanning.value?.projects ?? []) removeById(p.processes, id)
    }
    return runMutation({
      entity: 'process',
      call: () => new ProcessesApi(apiConfig()).processIdDelete(id),
      apply: remove,
      optimistic: remove,
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function deleteTask(id: number): Promise<boolean> {
    const remove = () => {
      for (const p of taskPlanning.value?.processes ?? []) removeById(p.tasks, id)
    }
    return runMutation({
      entity: 'task',
      call: () => new TasksApi(apiConfig()).taskIdDelete(id),
      apply: remove,
      optimistic: remove,
      onError: (m) => {
        error.value = m
      },
    })
  }

  async function deleteMilestone(id: number): Promise<boolean> {
    const remove = () => {
      for (const p of taskPlanning.value?.processes ?? []) removeById(p.milestones, id)
    }
    return runMutation({
      entity: 'milestone',
      call: () => new MilestonesApi(apiConfig()).milestoneIdDelete(id),
      apply: remove,
      optimistic: remove,
      onError: (m) => {
        error.value = m
      },
    })
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

  /**
   * Владельцы задачи (process/project) из загруженного планирования.
   * Пустой список — данные неизвестны (холодный кэш): проверку пропускаем,
   * финальное слово остаётся за сервером.
   */
  function taskOwnerIds(taskId: number): number[] {
    const owners: number[] = []
    const process = (taskPlanning.value?.processes ?? []).find((p: any) =>
      (p.tasks ?? []).some((t: any) => t.id === taskId),
    )
    if (!process) return owners
    if (process.owner_id != null) owners.push(process.owner_id)
    const project =
      projectPlanning.value?.projects?.find((pr: any) => pr.id === process.project_id) ??
      useAppStore().projects.find((pr: any) => pr.id === process.project_id)
    if (project?.owner_id != null) owners.push(project.owner_id)
    return owners
  }

  /**
   * Назначает ресурс задаче: POST /assignment + тихий reload задач.
   * Для не-admin сверяем владельцев заранее (данные уже в кэше планирования):
   * заведомо 403-назначение не уходит ни в онлайн-запрос, ни в офлайн-очередь.
   */
  async function assignResource(
    taskId: number,
    resourceId: number,
    quantity: number,
  ): Promise<boolean> {
    const auth = useAuthStore()
    const owners = auth.user?.role === 'admin' ? [] : taskOwnerIds(taskId)
    if (owners.length > 0) {
      const res = useAppStore().resources.find((r: any) => r.id === resourceId)
      if (res?.owner_id == null || !owners.includes(res.owner_id)) {
        error.value = 'Назначить можно только ресурс, принадлежащий владельцу задачи'
        return false
      }
    }
    const tempId = nextTempId()
    return runMutation({
      entity: 'assignment',
      tempId,
      call: () =>
        new AssignmentsApi(apiConfig()).assignmentPost({
          task_id: taskId,
          resource_id: resourceId,
          quantity,
        }),
      apply: async () => {
        await loadTaskPlanning(true)
      },
      optimistic: () => {
        const t = findTaskRow(taskId)
        if (!t) return
        const resources = t.resources ?? []
        if (!resources.some((r: any) => r.id === resourceId)) {
          // Поля кода/названия нужны для бейджа ресурса офлайн (код из справочника)
          const meta = useAppStore().resources.find((r: any) => r.id === resourceId)
          resources.push({
            id: resourceId,
            assignment_id: tempId,
            quantity,
            code: meta?.code,
            title: meta?.title,
          })
        }
      },
      onError: (m) => {
        error.value = m
      },
    })
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
    return runMutation({
      entity: 'assignment',
      call: () => new AssignmentsApi(apiConfig()).assignmentIdDelete(assignmentId!),
      apply: async () => {
        await loadTaskPlanning(true)
      },
      optimistic: () => {
        const t = findTaskRow(taskId)
        if (t) t.resources = (t.resources ?? []).filter((r: any) => r.id !== resourceId)
      },
      onError: (m) => {
        error.value = m
      },
    })
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

    try {
      await Promise.all(
        changes.map((c) => new ProjectsApi(apiConfig()).projectIdPut(c.id, { priority: c.priority })),
      )
    } catch (e: any) {
      const err = e as AxiosError
      if (err?.config && isElectron && isNetworkError(e)) {
        // Офлайн: локальная перестановка уже применена, PUT'ы уходят в очередь.
        // (очередь — только в настольной сборке)
        const base = axios.getUri(err.config).replace(/\d+$/, '')
        for (const c of changes) {
          try {
            await enqueueMutation({
              entity: 'project',
              method: (err.config.method ?? 'put') as Method,
              url: `${base}${c.id}`,
              body: { priority: c.priority },
            })
          } catch {
            // очередь недоступна — откатываемся к обычной ошибке
            error.value = e?.message ?? String(e)
            await loadProjectPlanning(true)
            return false
          }
        }
        return true
      }
      error.value = e.message || String(e)
      await loadProjectPlanning(true)
      return false
    }

    await loadProjectPlanning(true)
    const appProjects = useAppStore().projects
    if (Array.isArray(appProjects)) {
      for (const p of appProjects) {
        const c = changes.find((x) => x.id === p.id)
        if (c) p.priority = c.priority
      }
    }
    return true
  }

  // === Комментарии задач ===
  /** Загрузить комментарии задачи в кэш по task_id.
   *  - fresh (default) — всегда запрашивать онлайн (открытие модалки);
   *  - fresh:false — отдать кэш, если он уже есть (ховер тултипа задачи);
   *  - офлайн — только кэш (online-only). */
  async function loadTaskComments(taskId: number, opts?: { fresh?: boolean }): Promise<void> {
    if (commentsByTask.value[taskId] != null && !opts?.fresh) return
    if (isOffline.value && commentsByTask.value[taskId] != null) return
    commentsLoading.value = true
    commentsError.value = null
    try {
      const resp = await new TasksApi(apiConfig()).taskIdCommentsGet(taskId)
      commentsByTask.value[taskId] = (resp.data?.data as DtoCommentResponse[] | undefined) ?? []
    } catch (e: any) {
      commentsError.value = e?.message || String(e)
    } finally {
      commentsLoading.value = false
    }
  }

  /** Создать комментарий задачи (parent_id — ответ на комментарий той же задачи). */
  async function createTaskComment(
    taskId: number,
    content: string,
    parentId?: number,
  ): Promise<boolean> {
    commentsError.value = null
    try {
      const resp = await new TasksApi(apiConfig()).taskIdCommentsPost(taskId, {
        content,
        parent_id: parentId,
      })
      const errBody = resp.data?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
      const dto = resp.data?.data as DtoCommentResponse | undefined
      if (dto) {
        const list = commentsByTask.value[taskId] ?? []
        list.push(dto)
        commentsByTask.value[taskId] = [...list]
      }
      return true
    } catch (e: any) {
      commentsError.value = e?.message || String(e)
      return false
    }
  }

  /** Удалить комментарий (мягко; ответы остаются — станут «осиротевшими» в дереве). */
  async function deleteTaskComment(taskId: number, commentId: number): Promise<boolean> {
    commentsError.value = null
    try {
      await new TasksApi(apiConfig()).taskIdCommentsCommentIdDelete(taskId, commentId)
      const list = commentsByTask.value[taskId]
      if (list) commentsByTask.value[taskId] = list.filter((c) => c.id !== commentId)
      return true
    } catch (e: any) {
      commentsError.value = e?.message || String(e)
      return false
    }
  }

  return {
    projectPlanning,
    processPlanning,
    taskPlanning,
    loading,
    error,
    commentsByTask,
    commentsLoading,
    commentsError,
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
    taskOwnerIds,
    reorderProjects,
    loadTaskComments,
    createTaskComment,
    deleteTaskComment,
  }
})

// =============================================================
// RBAC-политики (матрица прав) — админ-редактор.
// Все операции online-only (поддержка outbox/офлайна не нужна).
// =============================================================
export const useRbacStore = defineStore('rbac', () => {
  const roles = ref<DomainRole[]>([])
  /** Активные правила матрицы (с id — нужны для удаления «нет доступа»). */
  const rules = ref<DtoRuleView[]>([])
  /** Эффективная матрица (с admin-байпасом) — источник отображения. */
  const matrix = ref<DtoMatrixCell[]>([])
  /** Маршрутные проверки (read-only справочник). */
  const routePolicies = ref<DtoRoutePolicyView[]>([])
  /** Справочник kind'ов маршрутных проверок. */
  const kinds = ref<PoliciesKindInfo[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  function setError(e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  }

  /** Загружает весь справочник RBAC одним проходом. */
  async function loadRbac(): Promise<boolean> {
    if (loading.value) return false
    loading.value = true
    error.value = null
    try {
      const api = new RBACApi(apiConfig())
      const [rolesR, rulesR, matrixR, routesR, kindsR] = await Promise.all([
        api.rbacRolesGet(),
        api.rbacRulesGet(),
        api.rbacMatrixGet(),
        api.rbacPoliciesGet(),
        api.rbacKindsGet(),
      ])
      roles.value = rolesR.data?.data ?? []
      rules.value = rulesR.data?.data ?? []
      matrix.value = matrixR.data?.data ?? []
      routePolicies.value = routesR.data?.data ?? []
      kinds.value = kindsR.data?.data ?? []
      return true
    } catch (e) {
      setError(e)
      return false
    } finally {
      loading.value = false
    }
  }

  /** Мои права (по матрице) — источник возможностей UI вместо ролей. */
  const myPermissions = ref<DtoPermission[]>([])
  const permsLoaded = ref(false)

  /** Владение скоупа по ресурсу — зеркало policies.go (own/parent/ancestor). */
  function scopeSatisfied(scope: string, resource: string, uid: number, o: { owner?: number | null; projectOwner?: number | null; processOwner?: number | null }): boolean {
    if (scope === 'all') return true
    if (uid <= 0) return false
    switch (scope) {
      case 'own':
        switch (resource) {
          case 'project': return o.projectOwner === uid
          case 'process': return o.processOwner === uid
          case 'task':
          case 'resource':
          case 'worker':
            return o.owner === uid
          default:
            return false
        }
      case 'parent':
        switch (resource) {
          case 'process': return o.projectOwner === uid
          case 'task':
          case 'milestone':
          case 'assignment':
            return o.processOwner === uid
          default:
            return false
        }
      case 'ancestor':
        switch (resource) {
          case 'task':
          case 'milestone':
          case 'assignment':
          case 'process':
            return o.owner === uid || o.processOwner === uid || o.projectOwner === uid
          default:
            return false
        }
      default:
        return false
    }
  }

  /** Есть ли у текущей роли право на действие в принципе. */
  function can(resource: string, action: string): boolean {
    return myPermissions.value.some((p) => p.resource === resource && p.action === action)
  }

  /** Скоуп права ('' — права нет). */
  function perm(resource: string, action: string): string {
    return myPermissions.value.find((p) => p.resource === resource && p.action === action)?.scope ?? ''
  }

  /** Право + владение объектом по скоупу (owners — из данных карточки). */
  function canOwn(
    resource: string,
    action: string,
    owners: { owner?: number | null; projectOwner?: number | null; processOwner?: number | null },
  ): boolean {
    const scope = perm(resource, action)
    if (!scope) return false
    const auth = useAuthStore()
    return scopeSatisfied(scope, resource, auth.user?.id ?? 0, owners)
  }

  /** Загружает мои права с сервера; офлайн — из localStorage-кеша. */
  async function loadMyPermissions(): Promise<boolean> {
    if (isOffline.value) {
      try {
        const cached = localStorage.getItem(PERMS_KEY)
        if (cached) myPermissions.value = JSON.parse(cached)
      } catch {
        /* кеш не читается — прав нет */
      }
      permsLoaded.value = true
      return true
    }
    try {
      const resp = await new PermissionsApi(apiConfig()).permissionsMeGet()
      myPermissions.value = resp.data?.data ?? []
      permsLoaded.value = true
      try {
        localStorage.setItem(PERMS_KEY, JSON.stringify(myPermissions.value))
      } catch {
        /* localStorage может быть недоступен */
      }
      return true
    } catch {
      return false
    }
  }

  /** Периодическая синхронизация прав (TTL поллинг вслед за бэком). */
  function startPermissionSync(ms = 30000): () => void {
    let timer: number | undefined
    let stopVisibility: (() => void) | undefined
    const tick = () => {
      if (!document.hidden) void loadMyPermissions()
    }
    const onVisibility = () => {
      if (document.hidden && timer != null) {
        window.clearInterval(timer)
        timer = undefined
      } else if (!document.hidden && timer == null) {
        timer = window.setInterval(tick, ms)
        void loadMyPermissions()
      }
    }
    stopVisibility = () => document.removeEventListener('visibilitychange', onVisibility)
    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()
    return () => {
      if (timer != null) window.clearInterval(timer)
      if (stopVisibility) stopVisibility()
    }
  }

  /** Легковесная загрузка каталога ролей (для select'ов без полного loadRbac). */
  async function ensureRoles(): Promise<void> {
    if (roles.value.length) return
    try {
      const rolesR = await new RBACApi(apiConfig()).rbacRolesGet()
      roles.value = rolesR.data?.data ?? []
    } catch {
      // каталог недоступен — UI работает на статическом списке ролей
    }
  }

  /** Перечитывает правила и матрицу после изменения (эффект «сейчас»). */
  async function reloadRules(): Promise<boolean> {
    try {
      const api = new RBACApi(apiConfig())
      const [rulesR, matrixR] = await Promise.all([api.rbacRulesGet(), api.rbacMatrixGet()])
      rules.value = rulesR.data?.data ?? []
      matrix.value = matrixR.data?.data ?? []
      return true
    } catch (e) {
      setError(e)
      return false
    }
  }

  /** Записывает правило (upsert по role+resource+action). */
  async function upsertRule(input: DtoRuleInput): Promise<boolean> {
    try {
      await new RBACApi(apiConfig()).rbacRulesPut(input)
      return true
    } catch (e) {
      setError(e)
      return false
    }
  }

  /** Мягкое удаление правила (зона «нет доступа»). */
  async function deleteRule(id: number): Promise<boolean> {
    try {
      await new RBACApi(apiConfig()).rbacRulesIdDelete(id)
      return true
    } catch (e) {
      setError(e)
      return false
    }
  }

  /** Создаёт (или оживляет) роль и обновляет локальный каталог. */
  async function createRole(input: { name: string; description?: string }): Promise<boolean> {
    try {
      const resp = await new RBACApi(apiConfig()).rbacRolesPost({ name: input.name, description: input.description ?? '' })
      if (resp.data?.data) {
        roles.value = [...roles.value.filter((r) => r.name !== resp.data?.data?.name), resp.data.data]
      }
      return true
    } catch {
      return false
    }
  }

  /** Обновляет описание роли. */
  async function updateRole(name: string, description: string): Promise<boolean> {
    try {
      await new RBACApi(apiConfig()).rbacRolesNamePut(name, { description })
      roles.value = roles.value.map((r) => (r.name === name ? { ...r, description } : r))
      return true
    } catch {
      return false
    }
  }

  /** Мягко удаляет роль (и её правила) и убирает из локального каталога. */
  async function deleteRole(name: string): Promise<boolean> {
    try {
      await new RBACApi(apiConfig()).rbacRolesNameDelete(name)
      roles.value = roles.value.filter((r) => r.name !== name)
      return true
    } catch {
      return false
    }
  }

  /** Сбрасывает правила и маршрутные проверки к дефолтам бэкенда. */
  async function resetRbac(): Promise<boolean> {
    try {
      await new RBACApi(apiConfig()).rbacResetPost()
      await reloadRules()
      return true
    } catch (e) {
      setError(e)
      return false
    }
  }

  return {
    roles,
    rules,
    matrix,
    routePolicies,
    kinds,
    loading,
    saving,
    error,
    loadRbac,
    ensureRoles,
    createRole,
    updateRole,
    deleteRole,
    myPermissions,
    permsLoaded,
    can,
    perm,
    canOwn,
    loadMyPermissions,
    startPermissionSync,
    reloadRules,
    upsertRule,
    deleteRule,
    resetRbac,
  }
})
