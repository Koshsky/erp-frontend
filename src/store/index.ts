import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
import axios, { type AxiosError, type Method } from 'axios'
import { AuthApi, ProjectsApi, ProcessesApi, TasksApi, TimesheetResourcesApi, TimesheetCalendarApi, TimesheetStatesApi, PlanningApi, MilestonesApi, UsersApi, AssignmentsApi, AutoCreateApi, RBACApi, PermissionsApi, Configuration } from '@/api'
import type { DtoUserInfo, DtoProject, DtoResourceResponse, DtoResourceCalendar, DtoResourceMemberResponse, DtoResourceAbsenceResponse, DtoUserResponse, DtoUserStateResponse, DtoStateResponse, DtoCreateResourceRequest, DtoUpdateResourceRequest, DtoCreateUserRequest, DtoUpdateUserRequest, DtoSetDaysRequest, DtoAdminUserResponse, DtoCreateUserResult, DtoResetPasswordResponse, DtoAutoCreateConfig, DtoAutoCreatedCounts, DtoCommentResponse, DomainRole, DtoRuleInput, DtoRuleView, DtoMatrixCell, DtoRoutePolicyView, PoliciesKindInfo, DtoPermission } from '@/api'
import { apiErrorMessage } from '@/utils'
import { getApiUrl } from '@/config'
import { isOffline } from '@/offline/state'
import { isElectron, setDesktopPassword } from '@/electron'
import { offlineFailFastAdapter } from '@/offline/failFast'
import { scheduleWarmup } from '@/offline/warmup'
import { enqueueMutation, isNetworkError, clearOutbox, type MutationEntity } from '@/offline/outbox'
import { applyRangeSplit } from '@/offline/periodSplit'
import { getAccessToken, setAccessToken } from '@/token'
import { tryAcquireRefreshLock, releaseRefreshLock, publishToken, subscribeToken } from '@/sessionSync'
import { isLoggedOut, clearLoggedOut, setLoggedOut } from '@/loggedOut'
import { getSavedLogin } from '@/syncCredentials'
import { shouldAutoSync } from '@/settings'
import { hydrateFromCache, apiPath } from '@/offline/hydrate'

const USER_KEY = 'mvs_erp_user'
/** Cache of my RBAC permissions for offline mode. */
const PERMS_KEY = 'mvs_erp_perms'

/** How long before the token expires that proactive refresh kicks in */
const REFRESH_MARGIN_MS = 120 * 1000
const REFRESH_INTERVAL_MS = 30 * 1000

/** Page size for listings (matches the backend default). */
const PAGE_SIZE = 50

/** Temporary (negative) id for entities created offline (unique over time) */
function nextTempId(): number {
  return -Date.now()
}

interface MutationOptions {
  call: () => Promise<unknown>
  entity: MutationEntity
  tempId?: number
  /** Regular path after a successful server response (data — the useful part of the payload) */
  apply: (data: any) => void | Promise<void>
  /** Optimistic path when offline (the request has already gone into the outbox queue) */
  optimistic: () => void
  onError: (message: string) => void
}

/**
 * Runs a mutation with offline support:
 *  - network unavailable (or a network error) → the request is saved to the
 *    outbox queue and the optimistic change is applied, returns true;
 *  - online success → the regular apply;
 *  - server error → false + onError (as before offline support).
 *  Auth/passwords (/auth/*, changePassword) do not go through this path.
 */
async function runMutation(opts: MutationOptions): Promise<boolean> {
  try {
    const resp = await opts.call()
    await opts.apply((resp as { data?: { data?: unknown } })?.data?.data ?? null)
    return true
  } catch (e: any) {
    const err = e as AxiosError
    if (err?.config && isElectron && isNetworkError(e)) {
      // Offline queue (outbox) — only in the desktop (Electron) build.
      // On the web, a network failure in a mutation is a regular error (no optimistic path).
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
      // Fail fast (10 s) on an unreachable backend: axios defaults to no timeout,
      // and a hanging server used to freeze the UI indefinitely — most critically
      // the silent auto re-login before first paint (see main.ts BOOT_BOUND_MS).
      timeout: 10000,
      // Fail-fast when offline is known (the banner is up): the request does not go
      // to the network or wait for a timeout — mutations immediately land in the outbox
      // queue, GETs are served from cache. The adapter is only placed here (store clients)
      // so that the queue flush (flushOutbox, raw axios) goes to the network as
      // usual: otherwise, once the network is back, writes would fail with Network Error.
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

/** Expiry time (epoch ms) from the access-token payload, or null if it cannot be parsed */
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

/** Whether the access token is expired: missing, unparseable, or exp already passed */
function accessTokenExpired(): boolean {
  const exp = decodeTokenExp(getAccessToken())
  if (exp == null) return true
  return exp - Date.now() <= 0
}

/** Whether the token should be renewed early (less than the margin left until expiry) */
function accessTokenExpiring(): boolean {
  const exp = decodeTokenExp(getAccessToken())
  if (exp == null) return true
  return exp - Date.now() <= REFRESH_MARGIN_MS
}

/**
 * Cross-tab refresh (web): another tab is already rotating the shared refresh
 * cookie. Adopt the access token it broadcasts (if it is fresher than ours),
 * otherwise return true and let the next 401 retry use the rotated cookie.
 */
function waitForExternalToken(): Promise<boolean> {
  return new Promise((resolve) => {
    let timer: number | undefined
    const unsub = subscribeToken((token) => {
      if (!token) return
      const cur = decodeTokenExp(getAccessToken())
      const next = decodeTokenExp(token)
      if (next != null && (cur == null || next > cur)) setAccessToken(token)
      if (timer != null) window.clearTimeout(timer)
      unsub()
      resolve(true)
    })
    timer = window.setTimeout(() => {
      unsub()
      resolve(true)
    }, 2000)
  })
}

// === Auth ===
export const useAuthStore = defineStore('auth', () => {
  // At startup there is no access token in memory; "logged in" holds while a saved
  // profile exists (not a secret). The guard restores the session via /auth/refresh
  // using the HttpOnly cookie; without a cookie, refresh returns 401 and logs out.
  const user = ref<DtoUserInfo | null>(readStoredUser())
  const isAuthenticated = ref<boolean>(Boolean(readStoredUser()))
  const accessExpired = computed<boolean>(() => accessTokenExpired())
  /** Session mode: online — real (with token), offline — local without token */
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
    // Background warm-up of the offline cache with data for the user's role
    scheduleWarmup()
  }

  /**
   * Offline login (Desktop, the button on /login when isOffline): a local session
   * without a token — data from cache, mutations to the queue, the server is not polled.
   * Identity: the saved profile (if it matches the entered login or no login was
   * entered), otherwise a minimal profile with the entered login.
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
      // Manual login clears the "logged out" flag — auto-sync is allowed again
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
      // Update the password saved for auto-sync so auto-sync does not break after a
      // password change: credentials are tied to the last manual login (Desktop).
      if (isElectron) {
        const saved = getSavedLogin()
        if (saved && user.value?.username && saved === user.value.username) {
          try {
            await setDesktopPassword(newPassword)
          } catch {
            // not critical: auto-sync will simply ask for credentials at login
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

  /** Proactive refresh: timer + tab visibility return, so the access token never expires prematurely */
  function scheduleProactiveRefresh() {
    if (proactiveTimer != null) return
    // Desktop + auto-sync: session renewal is done by session-maintenance
    // (silent re-login with auto-sync credentials) — the refresh cookie does not work
    // cross-site, so we skip it here to avoid a logout on 401.
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

  /** Renews the access token via the refresh token; on failure logs out.
   *  Parallel calls (timer/guard/interceptor) are deduplicated into a single request */
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
    // The refresh token lives in an HttpOnly cookie (AD-05): we do not send a body; the cookie is attached itself.
    // Offline refresh is impossible: we do not log out; the session lives until the network returns.
    if (isOffline.value) return true
    // After an explicit logout (logout) we do not call /auth/refresh: the cookie is already revoked,
    // the request would return 401 and show a false "Session expired", and on the server reusing
    // the revoked token would trigger reuse detection (revoking all of the
    // user's sessions). We return false without the network — the caller is logged out.
    if (isLoggedOut()) return false
    // Web only: coordinate the refresh across tabs. The refresh cookie is shared, and two tabs
    // refreshing the same (rotating) session pair at once make the second tab hit the backend
    // reuse detection — which revokes ALL of the user's sessions and logs every tab out.
    // Only one tab refreshes at a time; the rest adopt the token it broadcasts.
    const coordinated = !isElectron
    if (coordinated && !tryAcquireRefreshLock()) {
      // Another tab is refreshing — wait briefly for its token, otherwise defer:
      // the next 401 retry will use the already-rotated cookie (safe — the new
      // token is not revoked).
      return await waitForExternalToken()
    }
    loading.value = true
    error.value = null
    try {
      const api = new AuthApi(apiConfig())
      const resp = await api.authRefreshPost()
      const body = resp.data
      const errBody = body?.error as { code?: unknown; message?: string } | undefined
      if (errBody && errBody.code != null) throw new Error(apiErrorMessage(errBody))
      applySession(body?.data)
      const token = getAccessToken()
      if (coordinated && token) publishToken(token)
      return true
    } catch (e: any) {
      // Network error (no HTTP response): the server is unreachable. We do not log out.
      // In the desktop build we switch to offline mode (the session and the change queue in
      // IndexedDB live until the network returns); on the web there is no offline mode — we simply
      // do not kick the user out. Logout happens only on a real server failure.
      if (isNetworkError(e)) {
        if (isElectron) isOffline.value = true
        return true
      }
      error.value = e.message || String(e)
      logout()
      return false
    } finally {
      loading.value = false
      if (coordinated) releaseRefreshLock()
    }
  }

  function logout() {
    stopProactiveRefresh()
    // Do not let the queue flush under a new user/token
    void clearOutbox()
    // Revoke the refresh session on the server and clear the cookie (best-effort)
    try {
      void new AuthApi(apiConfig()).authLogoutPost()
    } catch {
      // the cookie will also be cleared on the client below
    }
    setAccessToken(null)
    localStorage.removeItem(USER_KEY)
    user.value = null
    isAuthenticated.value = false
    sessionMode.value = 'online'
    // After an explicit logout, auto-sync does not log in until a manual login (Desktop)
    setLoggedOut()
  }

  /** Fetches fresh user data by id via UsersApi.usersIdGet */
  async function fetchProfile(userId: number): Promise<boolean> {
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

  /** Local-first profile (desktop): hydrate from the cache; web fetches live */
  async function loadProfile(userId: number): Promise<boolean> {
    if (!isElectron) return fetchProfile(userId)
    if (user.value) return true
    await hydrateFromCache([
      {
        path: apiPath(`/user/${userId}`),
        filled: () => user.value != null,
        apply: (body) => {
          const d = (body as { data?: DtoUserInfo } | undefined)?.data
          if (d) {
            user.value = d
            localStorage.setItem(USER_KEY, JSON.stringify(d))
          }
        },
      },
    ])
    return user.value != null
  }

  // After a page reload with saved tokens, continue proactive refresh
  if (isAuthenticated.value) {
    scheduleProactiveRefresh()
    scheduleWarmup()
  }

  // Web: adopt fresher access tokens published by sibling tabs (cross-tab refresh
  // coordination — the refresh cookie is shared and rotated once per family).
  let unsubscribeSessionToken: (() => void) | null = null
  if (!isElectron) {
    unsubscribeSessionToken = subscribeToken((token) => {
      const cur = decodeTokenExp(getAccessToken())
      const next = decodeTokenExp(token)
      if (next != null && (cur == null || next > cur)) setAccessToken(token)
    })
    onScopeDispose(() => unsubscribeSessionToken?.())
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
    loadProfile,
    logout,
  }
})

// === App (projects and resources) ===
export const useAppStore = defineStore('app', () => {
  const projects = ref<DtoProject[]>([])
  const projectsLoading = ref(false)
  const projectsError = ref<string | null>(null)

  /**
   * Local-first (desktop only): fill the projects list from the cache if empty.
   * The web build has no offline cache — it reads straight from the server
   * (refreshProjects), as before the offline-first refactor.
   */
  async function loadProjects(): Promise<void> {
    if (!isElectron) {
      await refreshProjects()
      return
    }
    if (projects.value.length) return
    await hydrateFromCache([
      {
        path: apiPath('/projects'),
        filled: () => projects.value.length > 0,
        apply: (body) => {
          const d = (body as { data?: { items?: DtoProject[] } } | undefined)?.data
          projects.value = d?.items ?? []
        },
      },
    ])
  }

  async function refreshProjects(): Promise<void> {
    // Only admin/dp/rp can see projects (per the RBAC matrix). For other roles the
    // listing is forbidden by the backend (403) — we do not send the request at all.
    const role = useAuthStore().user?.role
    if (role && role !== 'admin' && role !== 'dp' && role !== 'rp') {
      projects.value = []
      return
    }
    projectsLoading.value = true
    projectsError.value = null
    try {
      const api = new ProjectsApi(apiConfig())
      const resp = await api.projectGet(PAGE_SIZE, undefined, 0)
      const data = resp.data?.data
      projects.value = data?.items ?? []
    } catch (e: any) {
      projectsError.value = e.message || String(e)
    } finally {
      projectsLoading.value = false
    }
  }

  const resources = ref<DtoResourceResponse[]>([])
  const resourcesLoading = ref(false)
  const resourcesError = ref<string | null>(null)

  async function loadResources(): Promise<void> {
    if (!isElectron) {
      await refreshResources()
      return
    }
    if (resources.value.length) return
    await hydrateFromCache([
      {
        path: apiPath('/resources'),
        filled: () => resources.value.length > 0,
        apply: (body) => {
          const d = (body as { data?: { items?: DtoResourceResponse[] } } | undefined)?.data
          resources.value = d?.items ?? []
        },
      },
    ])
  }

  async function refreshResources(): Promise<void> {
    resourcesLoading.value = true
    resourcesError.value = null
    try {
      const api = new TimesheetResourcesApi(apiConfig())
      const resp = await api.resourcesGet(PAGE_SIZE, undefined, 0)
      const data = resp.data?.data
      resources.value = data?.items ?? []
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

  // === Resource users (/resources/{id}/members) ===
  const resourceMembers = ref<Record<number, DtoResourceMemberResponse[]>>({})

  /** Loads the member (user) list of a resource — local-first (cache) */
  async function loadResourceMembers(resourceId: number): Promise<void> {
    if (!isElectron) {
      await refreshResourceMembers(resourceId)
      return
    }
    if (resourceMembers.value[resourceId] != null) return
    await hydrateFromCache([
      {
        path: apiPath(`/resources/${resourceId}/members`),
        filled: () => resourceMembers.value[resourceId] != null,
        apply: (body) => {
          resourceMembers.value[resourceId] =
            (body as { data?: DtoResourceMemberResponse[] } | undefined)?.data ?? []
        },
      },
    ])
  }

  async function refreshResourceMembers(resourceId: number): Promise<void> {
    try {
      const api = new TimesheetResourcesApi(apiConfig())
      const resp = await api.resourcesIdMembersGet(resourceId)
      resourceMembers.value[resourceId] = resp.data?.data ?? []
    } catch (e: any) {
      resourcesError.value = e.message || String(e)
    }
  }

  /** Adds a user to a resource (POST members); any user can be a member */
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
        await refreshResourceMembers(resourceId)
        await refreshResources()
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

  /** Removes a user from a resource (DELETE members/{userId}) */
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
        await refreshResources()
      },
      optimistic: remove,
      onError: (m) => {
        resourcesError.value = m
      },
    })
  }

  /** Reverse map "user → their resource" (membership is unique: UNIQUE(user_id)) */
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
   * Ensures resources and their members are loaded — for resource badges and the
   * filter on the "Employees" page. With force=true members are reloaded always
   * (so badges reflect the current membership after changes on the "Resources"
   * page), otherwise only the missing ones are loaded.
   */
  async function ensureResourceMembers(force = false) {
    if (!resources.value.length) await loadResources()
    for (const res of resources.value) {
      if (res.id == null) continue
      if (force || resourceMembers.value[res.id] == null) {
        // force — explicit network refresh (badges after edits); otherwise local hydrate
        await (force ? refreshResourceMembers(res.id) : loadResourceMembers(res.id))
      }
    }
  }

  /**
   * Changes an employee's resource: detaches from fromResourceId, attaches to
   * toResourceId (null — employee without a resource). Returns false and puts a
   * message into resourcesError on rejection (e.g. 403 on a foreign resource).
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

  // === Resource availability calendar (/timesheet/calendar) ===
  // Load window: 180 days back, 360 forward (540 total < the backend's 730-day limit).
  const CALENDAR_BACK_DAYS = 180
  const CALENDAR_FORWARD_DAYS = 360
  const calendar = ref<DtoResourceCalendar[]>([])
  const calendarLoading = ref(false)
  const calendarError = ref<string | null>(null)

  /** Date YYYY-MM-DD n days from the base date (for the calendar load window) */
  function calendarDay(day: Date, offsetDays: number): string {
    const d = new Date(day.getTime() + offsetDays * 86_400_000)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${dd}`
  }

  /** Loads resource availability for the "180 days back / 360 days forward" window (within the backend limit) */
  async function loadCalendar(): Promise<void> {
    if (!isElectron) {
      await refreshCalendar()
      return
    }
    if (calendar.value.length) return
    await hydrateFromCache([
      {
        path: apiPath('/timesheet/calendar'),
        filled: () => calendar.value.length > 0,
        apply: (body) => {
          const d = (body as { data?: { resources?: DtoResourceCalendar[] } } | undefined)?.data
          calendar.value = d?.resources ?? []
        },
      },
    ])
  }

  async function refreshCalendar(): Promise<void> {
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

  // === Resource member absences (/resources/{id}/absence) for the UsageCell tooltip ===
  const absenceByResource = ref<Record<number, DtoResourceAbsenceResponse[]>>({})

  /** Loads absences (unavailable states) of a resource's members for a window */
  async function loadResourceAbsence(resourceId: number, from: string, to: string) {
    try {
      const api = new TimesheetResourcesApi(apiConfig())
      const resp = await api.resourcesIdAbsenceGet(resourceId, from, to)
      absenceByResource.value = { ...absenceByResource.value, [resourceId]: resp.data?.data ?? [] }
    } catch {
      // Skip: the tooltip will simply not show absent members on this resource.
    }
  }

  const users = ref<DtoUserInfo[]>([])
  const usersLoading = ref(false)
  const usersError = ref<string | null>(null)

  /** Current user's direct subordinates (/users scope): "own employees".
   *  For vp — only users with manager_id = current user; for admin — everyone.
   *  Used as the candidate pool for task "assignees". */
  const myStaff = ref<DtoUserResponse[]>([])
  const myStaffLoading = ref(false)

  async function loadUsers(): Promise<void> {
    if (!isElectron) {
      await refreshUsers()
      return
    }
    if (users.value.length) return
    await hydrateFromCache([
      {
        path: apiPath('/user/all'),
        filled: () => users.value.length > 0,
        apply: (body) => {
          const d = (body as { data?: DtoUserInfo[] } | undefined)?.data
          users.value = d ?? []
        },
      },
    ])
  }

  async function refreshUsers(): Promise<void> {
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

  /** Loads "own staff" (scoped /users without a role filter). */
  async function loadMyStaff(): Promise<void> {
    if (!isElectron) {
      await refreshMyStaff()
      return
    }
    if (myStaff.value.length) return
    await hydrateFromCache([
      {
        path: apiPath('/user'),
        filled: () => myStaff.value.length > 0,
        keyPredicate: (key) => /\blimit=500\b/.test(key),
        apply: (body) => {
          const d = (body as { data?: { items?: DtoUserResponse[] } } | undefined)?.data
          myStaff.value = d?.items ?? []
        },
      },
    ])
  }

  async function refreshMyStaff(): Promise<void> {
    myStaffLoading.value = true
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userGet(500, undefined, undefined, undefined, 0)
      myStaff.value = resp.data?.data?.items ?? []
    } catch {
      // Not critical: the candidate pool stays as is.
    } finally {
      myStaffLoading.value = false
    }
  }

  // === Admin: users (all roles, with the password hash) ===
  const adminUsers = ref<DtoAdminUserResponse[]>([])
  const adminUsersLoading = ref(false)
  const adminUsersError = ref<string | null>(null)

  /** Full user list for the admin page (without password hashes) */
  async function loadAdminUsers() {
    adminUsersLoading.value = true
    adminUsersError.value = null
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userGet(500, undefined, undefined, false, 0)
      adminUsers.value = resp.data?.data?.items ?? []
    } catch (e: any) {
      adminUsersError.value = apiErrorMessage(e)
    } finally {
      adminUsersLoading.value = false
    }
  }

  /** Creates a user; returns the generated password (if any) */
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

  /** Resets a user's password; returns the new password (shown once) */
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

  /** Updates a user (role/manager/profile) */
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

  /** Sets/unsets a user's manager (manager_id: null — no manager) */
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

  /** Deletes (soft) a user — user lifecycle lives in the admin users section */
  async function deleteUser(id: number): Promise<boolean> {
    try {
      const api = new UsersApi(apiConfig())
      await api.userIdDelete(id)
      await loadAdminUsers()
      return true
    } catch (e: any) {
      adminUsersError.value = apiErrorMessage(e)
      return false
    }
  }

  // === Admin: auto-creation of projects ===
  const autoCreateConfig = ref<DtoAutoCreateConfig | null>(null)
  const autoCreateLoading = ref(false)
  const autoCreateError = ref<string | null>(null)

  /** Loads the auto-create configuration */
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

  /** Saves the auto-create configuration (full replacement) */
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

  return {
    projects,
    projectsLoading,
    projectsError,
    resources,
    resourcesLoading,
    resourcesError,
    users,
    usersLoading,
    usersError,
    calendar,
    calendarLoading,
    calendarError,
    loadProjects,
    refreshProjects,
    loadResources,
    refreshResources,
    loadCalendar,
    refreshCalendar,
    absenceByResource,
    loadResourceAbsence,
    loadUsers,
    refreshUsers,
    myStaff,
    myStaffLoading,
    loadMyStaff,
    refreshMyStaff,
    adminUsers,
    adminUsersLoading,
    adminUsersError,
    loadAdminUsers,
    createUser,
    resetPassword,
    updateUser,
    updateManager,
    deleteUser,
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
    refreshResourceMembers,
    addResourceMember,
    removeResourceMember,
    resourceByUser,
    ensureResourceMembers,
    changeEmployeeResource,
  }
})

// === Timesheet (employee states, page for vp/admin) ===
export const useTimesheetStore = defineStore('timesheet', () => {
  const app = useAppStore()

  // States load window: by default "180 days back / 360 days forward"; with
  // infinite scroll the timeline is extended via ensureRange (loading new ranges).
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

  /** Employees (users visible to the current user), sorted by full name */
  const employeesWithTitles = computed<DtoUserResponse[]>(() =>
    [...employees.value].sort(
      (a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', 'ru') ||
        (a.position || '').localeCompare(b.position || '', 'ru'),
    ),
  )

  /**
   * Timesheet rows: the employees visible to the current user (direct subordinates;
   * admin — everyone). The current user is intentionally not a row — the roster
   * mirrors the "Employees" page.
   */
  const timesheetRows = computed<DtoUserResponse[]>(() => employeesWithTitles.value)

  /** Date YYYY-MM-DD n days from an ISO date (local timezone) */
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

  /** Local-first: hydrate each employee's states from the cache (freshest window) */
  async function fetchPeriodsLocal(): Promise<void> {
    const targets = timesheetRows.value.map((emp) => ({
      path: apiPath(`/user/${emp.id ?? 0}/days`),
      filled: () => periodsByEmployee.value[emp.id ?? 0] != null,
      apply: (body: unknown) => {
        const list = (body as { data?: DtoUserStateResponse[] } | undefined)?.data ?? []
        periodsByEmployee.value[emp.id ?? 0] = [...list].sort((a, b) =>
          (a.start_date ?? '').localeCompare(b.start_date ?? ''),
        )
      },
    }))
    await hydrateFromCache(targets)
  }

  /** Network refresh (PULL): loads states (including the user's own) for [start, end] and merges them into the cache by id */
  async function refreshPeriods(start: string, end: string): Promise<void> {
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
      // A fresh response for the [start, end] window is authoritative for periods overlapping it:
      // old overlapping periods (e.g. cleared via DELETE) are removed,
      // then new ones are merged. Periods outside the window are kept for incremental loading.
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

  /** An employee's period covering a day (binary search over the sorted periods) */
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

  /** Local-first: hydrate the employee list (scoped by the backend) from the cache */
  async function loadEmployeesList(): Promise<void> {
    if (employees.value.length) return
    await hydrateFromCache([
      {
        path: apiPath('/user'),
        filled: () => employees.value.length > 0,
        // No role filter — the roster is scoped server-side (admin: all, vp: own
        // subordinates). The employees query is the only /user call with limit=50.
        keyPredicate: (key) => /\blimit=50\b/.test(key),
        apply: (body) => {
          const d = (body as { data?: { items?: DtoUserResponse[]; total?: number } } | undefined)?.data
          employees.value = d?.items ?? []
          employeesTotal.value = d?.total ?? 0
        },
      },
    ])
  }

  async function refreshEmployees(managerId?: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const api = new UsersApi(apiConfig())
      const resp = await api.userGet(PAGE_SIZE, undefined, managerId ?? undefined, undefined, 0)
      const data = resp.data?.data
      // Sorting is added by the computed employeesWithTitles.
      employees.value = data?.items ?? []
      employeesTotal.value = data?.total ?? 0
    } catch (e: any) {
      setError(e)
    } finally {
      loading.value = false
    }
  }

  /** Loads employees and initializes the states window (for the timesheet).
   *  Desktop — local-first; web reads from the server as before. */
  async function loadEmployees(): Promise<void> {
    if (!isElectron) {
      await refreshEmployees()
      await loadInitialWindow()
      return
    }
    if (!employees.value.length) await loadEmployeesList()
    await loadInitialWindow()
  }

  /** Loads the states reference — desktop local-first, web reads from the server */
  async function loadStates(): Promise<void> {
    if (!isElectron) {
      await refreshStates()
      return
    }
    if (states.value.length) return
    await hydrateFromCache([
      {
        path: apiPath('/timesheet/states'),
        filled: () => states.value.length > 0,
        apply: (body) => {
          states.value = (body as { data?: DtoStateResponse[] } | undefined)?.data ?? []
        },
      },
    ])
  }

  async function refreshStates(): Promise<void> {
    try {
      const api = new TimesheetStatesApi(apiConfig())
      const resp = await api.timesheetStatesGet()
      states.value = resp.data?.data ?? []
    } catch (e: any) {
      setError(e)
    }
  }

  /** Fields of the create/update status request */
  interface StatePayload {
    code: string
    name: string
    is_available: boolean
  }

  /** Creates a status and updates the reference */
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
          await refreshStates()
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

  /** Updates a status and refreshes the reference */
  async function updateState(id: number, payload: StatePayload): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      return await runMutation({
        entity: 'state',
        call: () => new TimesheetStatesApi(apiConfig()).timesheetStatesIdPut(id, payload),
        apply: async () => {
          await refreshStates()
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

  /** Deletes a status (deleting an in-use status may be rejected by the DB) */
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
          await refreshStates()
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

  /** Initializes the "180 back / 360 forward" window: desktop — local hydrate,
   *  web — network period load (as before the offline-first refactor). */
  async function loadInitialWindow(): Promise<void> {
    windowStart.value = shiftDate(todayISO(), -WINDOW_BACK_DAYS)
    windowEnd.value = shiftDate(todayISO(), WINDOW_FORWARD_DAYS)
    if (!isElectron) {
      await refreshPeriods(windowStart.value, windowEnd.value)
      return
    }
    await fetchPeriodsLocal()
  }

  /** Extends the loaded window to cover [start, end] and loads only the new ranges (user-initiated PULL) */
  async function ensureRange(startISO: string, endISO: string) {
    if (startISO < windowStart.value) {
      const from = startISO
      const to = shiftDate(windowStart.value, -1)
      windowStart.value = startISO
      await refreshPeriods(from, to)
    }
    if (endISO > windowEnd.value) {
      const from = shiftDate(windowEnd.value, 1)
      const to = endISO
      windowEnd.value = endISO
      await refreshPeriods(from, to)
    }
  }

  /** Assigns a state to an employee's date range (PUT days, overwrites overlaps) */
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
          await refreshPeriods(windowStart.value, windowEnd.value)
        },
        optimistic: () => {
          const existing = periodsByEmployee.value[employeeId] ?? []
          // State fields are needed for the cell color and abbreviation offline
          const st = states.value.find((s) => s.id === stateId)
          // Splitting like the backend: subtract [startDate, endDate]; the tails
          // of overlapping ranges are kept, the old range does not disappear.
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

  /** Clears states on an employee's date range (DELETE days; without state_id — all) */
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
          await refreshPeriods(windowStart.value, windowEnd.value)
        },
        optimistic: () => {
          const existing = periodsByEmployee.value[employeeId] ?? []
          // Like the backend DeleteStateRange: subtract the range from overlapping
          // intervals (tails are kept); with stateId — only its states.
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
    refreshEmployees,
    loadStates,
    refreshStates,
    refreshPeriods,
    createState,
    updateState,
    deleteState,
    ensureRange,
    periodFor,
    assignRange,
    clearRange,
  }
})

// === Planning (data from /planning/* for the three charts) ===
export const usePlanningStore = defineStore('planning', () => {
  const projectPlanning = ref<any>(null)
  const processPlanning = ref<any>(null)
  const taskPlanning = ref<any>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // === Task comments (discussion threads) ===
  // Cache per task; offline serves the last loaded list (online-only).
  const commentsByTask = ref<Record<number, DtoCommentResponse[]>>({})
  const commentsLoading = ref(false)
  const commentsError = ref<string | null>(null)

  /** Common planning load path: silent mode leaves loading/error untouched,
   *  so a background reload after a mutation does not clear a visible error and does not show a spinner. */
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

  /** Local-first: hydrate a planning payload from the cache */
  function hydratePlanning(
    get: () => unknown | null | undefined,
    set: (v: unknown) => void,
    path: string,
  ): Promise<void> {
    return hydrateFromCache([
      {
        path,
        filled: () => get() != null,
        apply: (body) => {
          set((body as { data?: unknown } | undefined)?.data ?? null)
        },
      },
    ])
  }

  async function loadProjectPlanning(): Promise<void> {
    if (!isElectron) {
      await refreshProjectPlanning()
      return
    }
    await hydratePlanning(
      () => projectPlanning.value,
      (v) => {
        projectPlanning.value = v
      },
      apiPath('/planning/projects'),
    )
  }

  async function loadProcessPlanning(): Promise<void> {
    if (!isElectron) {
      await refreshProcessPlanning()
      return
    }
    await hydratePlanning(
      () => processPlanning.value,
      (v) => {
        processPlanning.value = v
      },
      apiPath('/planning/processes'),
    )
  }

  async function loadTaskPlanning(): Promise<void> {
    if (!isElectron) {
      await refreshTaskPlanning()
      return
    }
    await hydratePlanning(
      () => taskPlanning.value,
      (v) => {
        taskPlanning.value = v
      },
      apiPath('/planning/tasks'),
    )
  }

  async function refreshProjectPlanning(silent = false): Promise<void> {
    await runLoad(silent, async () => {
      const resp = await new PlanningApi(apiConfig()).planningProjectsGet()
      projectPlanning.value = resp.data?.data ?? null
    })
  }

  async function refreshProcessPlanning(silent = false): Promise<void> {
    await runLoad(silent, async () => {
      const resp = await new PlanningApi(apiConfig()).planningProcessesGet()
      processPlanning.value = resp.data?.data ?? null
    })
  }

  async function refreshTaskPlanning(silent = false): Promise<void> {
    await runLoad(silent, async () => {
      const resp = await new PlanningApi(apiConfig()).planningTasksGet()
      taskPlanning.value = resp.data?.data ?? null
    })
  }

  /** Saves the new bar dates, then silently reloads the data (no spinner).
   *  On a save error it shows a message and falls back to the server data. */
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

  /** Bar date shift: PUT the dates + silent reload (online) / local edit (offline) */
  async function updateTaskDates(id: number, start_date: string, end_date: string): Promise<boolean> {
    return runMutation({
      entity: 'task',
      call: () => new TasksApi(apiConfig()).taskIdPut(id, { start_date, end_date }),
      apply: async () => {
        await refreshTaskPlanning(true)
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
        await refreshProcessPlanning(true)
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
        await refreshProjectPlanning(true)
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

  /** Milestone shift (single date): PUT /milestone/{id} + silent reload of tasks */
  async function updateMilestoneDate(id: number, date: string): Promise<boolean> {
    return runMutation({
      entity: 'milestone',
      call: () => new MilestonesApi(apiConfig()).milestoneIdPut(id, { date }),
      apply: async () => {
        await refreshTaskPlanning(true)
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
    patch: { code?: string; owner_id?: number; color?: string },
  ): Promise<boolean> {
    return runMutation({
      entity: 'project',
      call: () => new ProjectsApi(apiConfig()).projectIdPut(id, patch),
      apply: async () => {
        await refreshProjectPlanning(true)
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
    patch: { title?: string; owner_id?: number; color?: string },
  ): Promise<boolean> {
    return runMutation({
      entity: 'process',
      call: () => new ProcessesApi(apiConfig()).processIdPut(id, patch),
      apply: async () => {
        await refreshProcessPlanning(true)
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

  async function updateTaskMeta(id: number, patch: { title?: string; owner_id?: number; color?: string }): Promise<boolean> {
    return runMutation({
      entity: 'task',
      call: () => new TasksApi(apiConfig()).taskIdPut(id, patch),
      apply: async () => {
        await refreshTaskPlanning(true)
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
    patch: { title?: string; content?: string; color?: string },
  ): Promise<boolean> {
    return runMutation({
      entity: 'milestone',
      call: () => new MilestonesApi(apiConfig()).milestoneIdPut(id, patch),
      apply: async () => {
        await refreshTaskPlanning(true)
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

  /** Inserts an item into an array by index (shifts rows down); index defaults to the end. */
  function insertAt<T>(list: T[] | null | undefined, index: number | undefined, item: T): void {
    if (!list) return
    const i = index == null || index < 0 || index > list.length ? list.length : index
    list.splice(i, 0, item)
  }

  /** Creates a project with a fixed priority of 100 — at the end of the list.
   *  Returns what the auto-create template (server-side trigger) added to the
   *  project (null when offline/optimistic or the template is empty). */
  async function createProject(
    payload: {
      code: string
      start_date: string
      end_date: string
      priority?: number
      color?: string
    },
  ): Promise<{ ok: boolean; autoCreated: DtoAutoCreatedCounts | null }> {
    const tempId = nextTempId()
    let autoCreated: DtoAutoCreatedCounts | null = null
    const ok = await runMutation({
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
          color?: string
          auto_created?: DtoAutoCreatedCounts
        }
        const ac = d.auto_created
        if (ac && (ac.processes || ac.tasks || ac.assignments)) autoCreated = ac
        const item = {
          id: d.id ?? 0,
          project_code: d.code ?? payload.code,
          start_date: d.start_date ?? payload.start_date,
          end_date: d.end_date ?? payload.end_date,
          priority: d.priority ?? 100,
          owner_id: d.owner_id,
          color: d.color,
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
          color: payload.color,
        }
        const app = useAppStore()
        insertAt(projectPlanning.value?.projects, undefined, item)
        insertAt(app.projects, undefined, item)
      },
      onError: (m) => {
        error.value = m
      },
    })
    return { ok, autoCreated }
  }

  async function createProcess(
    payload: {
      title: string
      project_id: number
      start_date: string
      end_date: string
      color?: string
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
        const d = dto as { id?: number; title?: string; start_date?: string; end_date?: string; color?: string }
        const project = processPlanning.value?.projects?.find((p: any) => p.id === payload.project_id)
        insertAt(project?.processes, index, {
          id: d.id ?? 0,
          title: d.title ?? payload.title,
          start_date: d.start_date ?? payload.start_date,
          end_date: d.end_date ?? payload.end_date,
          project_id: payload.project_id,
          color: d.color ?? payload.color,
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
          color: payload.color,
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
      color?: string
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
        const d = dto as { id?: number; title?: string; start_date?: string; end_date?: string; color?: string }
        const proc = taskPlanning.value?.processes?.find((p: any) => p.id === payload.process_id)
        insertAt(proc?.tasks, index, {
          id: d.id ?? 0,
          title: d.title ?? payload.title,
          start_date: d.start_date ?? payload.start_date,
          end_date: d.end_date ?? payload.end_date,
          resources: [],
          color: d.color ?? payload.color,
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
          color: payload.color,
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
    color?: string
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
        const d = dto as { id?: number; title?: string; content?: string; date?: string; color?: string }
        const proc = taskPlanning.value?.processes?.find((p: any) => p.id === payload.process_id)
        proc?.milestones?.push({
          id: d.id ?? 0,
          title: d.title ?? payload.title,
          content: d.content ?? payload.content ?? '',
          date: d.date ?? payload.date,
          color: d.color ?? payload.color,
        })
      },
      optimistic: () => {
        const proc = taskPlanning.value?.processes?.find((p: any) => p.id === payload.process_id)
        proc?.milestones?.push({
          id: tempId,
          title: payload.title,
          content: payload.content ?? '',
          date: payload.date,
          color: payload.color,
        })
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  /** Removes an item from an array by id (no-op if the list or the item is missing). */
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

  /** Finds a task's resource (from /planning/tasks) by resource_id together with assignment_id */
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
   * Task owners (process/project) from the loaded planning data.
   * An empty list — the data is unknown (cold cache): the check is skipped,
   * the final word stays with the server.
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
   * Assigns a resource to a task: POST /assignment + silent reload of tasks.
   * For non-admin, owners are checked beforehand (the data is already in the planning cache):
   * a definitely-403 assignment goes neither to an online request nor to the offline queue.
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
        await refreshTaskPlanning(true)
      },
      optimistic: () => {
        const t = findTaskRow(taskId)
        if (!t) return
        const resources = t.resources ?? []
        if (!resources.some((r: any) => r.id === resourceId)) {
          // Code/title/color fields are needed for the resource badge offline (from the reference)
          const meta = useAppStore().resources.find((r: any) => r.id === resourceId)
          resources.push({
            id: resourceId,
            assignment_id: tempId,
            quantity,
            code: meta?.code,
            title: meta?.title,
            color: meta?.color,
          })
        }
      },
      onError: (m) => {
        error.value = m
      },
    })
  }

  /** Removes a resource assignment from a task: DELETE /assignment/{id} (by assignment_id from
   *  /planning/tasks, otherwise falls back to GET /assignment → lookup by (task_id, resource_id)).
   *  On success — silent reload of tasks. */
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
        await refreshTaskPlanning(true)
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

  /** Reorders projects (row drag): new priorities = index+1, PUTs are sent
   *  only for the changed ones — the moved project and those shifted between positions.
   *  On error, silently reload the data (rolling back to the server order). */
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
        // Offline: the local reorder is already applied; the PUTs go to the queue.
        // (the queue — only in the desktop build)
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
            // queue unavailable — fall back to a regular error
            error.value = e?.message ?? String(e)
            await refreshProjectPlanning(true)
            return false
          }
        }
        return true
      }
      error.value = e.message || String(e)
      await refreshProjectPlanning(true)
      return false
    }

    await refreshProjectPlanning(true)
    const appProjects = useAppStore().projects
    if (Array.isArray(appProjects)) {
      for (const p of appProjects) {
        const c = changes.find((x) => x.id === p.id)
        if (c) p.priority = c.priority
      }
    }
    return true
  }

  /** Reorders the processes of one project (row drag): renumbers the order
   *  values locally and sends the complete ordered id list to /process/order.
   *  Offline (desktop) — the reorder is queued; on any other error the data is
   *  silently reloaded (server order wins). */
  async function reorderProcesses(projectId: number, from: number, to: number): Promise<boolean> {
    const project = processPlanning.value?.projects?.find((p: any) => p.id === projectId)
    const list = project?.processes
    if (!Array.isArray(list) || from === to) return true
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return false
    const moved = list.splice(from, 1)[0]
    list.splice(to, 0, moved)
    list.forEach((p: any, i: number) => {
      p.order = i + 1
    })
    const ids = list.map((p: any) => p.id)

    try {
      await new ProcessesApi(apiConfig()).processOrderPut({ project_id: projectId, ids })
    } catch (e: any) {
      const err = e as AxiosError
      if (err?.config && isElectron && isNetworkError(e)) {
        try {
          await enqueueMutation({
            entity: 'reorder',
            method: (err.config.method ?? 'put') as Method,
            url: axios.getUri(err.config),
            body: { project_id: projectId, ids },
          })
        } catch {
          error.value = e?.message ?? String(e)
          await refreshProcessPlanning(true)
          return false
        }
        return true
      }
      error.value = e.message || String(e)
      await refreshProcessPlanning(true)
      return false
    }
    return true
  }

  /** Reorders the tasks of one process (row drag): renumbers the order values
   *  locally and sends the complete ordered id list to /task/order.
   *  Offline (desktop) — the reorder is queued; on any other error the data is
   *  silently reloaded (server order wins). */
  async function reorderTasks(processId: number, from: number, to: number): Promise<boolean> {
    const process = taskPlanning.value?.processes?.find((p: any) => p.id === processId)
    const list = process?.tasks
    if (!Array.isArray(list) || from === to) return true
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return false
    const moved = list.splice(from, 1)[0]
    list.splice(to, 0, moved)
    list.forEach((t: any, i: number) => {
      t.order = i + 1
    })
    const ids = list.map((t: any) => t.id)

    try {
      await new TasksApi(apiConfig()).taskOrderPut({ process_id: processId, ids })
    } catch (e: any) {
      const err = e as AxiosError
      if (err?.config && isElectron && isNetworkError(e)) {
        try {
          await enqueueMutation({
            entity: 'reorder',
            method: (err.config.method ?? 'put') as Method,
            url: axios.getUri(err.config),
            body: { process_id: processId, ids },
          })
        } catch {
          error.value = e?.message ?? String(e)
          await refreshTaskPlanning(true)
          return false
        }
        return true
      }
      error.value = e.message || String(e)
      await refreshTaskPlanning(true)
      return false
    }
    return true
  }

  // === Task comments ===
  /** Loads a task's comments into the cache by task_id.
   *  - fresh (default) — always request online (opening the modal);
   *  - fresh:false — serve the cache if already present (task tooltip hover);
   *  - offline — cache only (online-only). */
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

  /** Creates a task comment (parent_id — a reply to a comment of the same task). */
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
      // Keep the task-bar comment badge in sync with the comment list
      const task = findTaskRow(taskId)
      if (task) task.comments_count = (task.comments_count ?? 0) + 1
      return true
    } catch (e: any) {
      commentsError.value = e?.message || String(e)
      return false
    }
  }

  /** Deletes a comment (softly; replies stay — they become "orphaned" in the tree). */
  async function deleteTaskComment(taskId: number, commentId: number): Promise<boolean> {
    commentsError.value = null
    try {
      await new TasksApi(apiConfig()).taskIdCommentsCommentIdDelete(taskId, commentId)
      const list = commentsByTask.value[taskId]
      if (list) commentsByTask.value[taskId] = list.filter((c) => c.id !== commentId)
      // Keep the task-bar comment badge in sync (floor at 0 in case of drift)
      const task = findTaskRow(taskId)
      if (task) task.comments_count = Math.max(0, (task.comments_count ?? 0) - 1)
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
    refreshProjectPlanning,
    refreshProcessPlanning,
    refreshTaskPlanning,
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
    reorderProcesses,
    reorderTasks,
    loadTaskComments,
    createTaskComment,
    deleteTaskComment,
  }
})

// =============================================================
// RBAC policies (permission matrix) — the admin editor.
// All operations are online-only (no outbox/offline support needed).
// =============================================================
export const useRbacStore = defineStore('rbac', () => {
  const roles = ref<DomainRole[]>([])
  /** Active matrix rules (with id — needed to delete "no access" entries). */
  const rules = ref<DtoRuleView[]>([])
  /** Effective matrix (with the admin bypass) — the display source. */
  const matrix = ref<DtoMatrixCell[]>([])
  /** Route checks (read-only reference). */
  const routePolicies = ref<DtoRoutePolicyView[]>([])
  /** Reference of route check kinds. */
  const kinds = ref<PoliciesKindInfo[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  function setError(e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  }

  /** Loads the whole RBAC reference in one pass. */
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

  /** My permissions (by the matrix) — the source of UI capabilities instead of roles. */
  const myPermissions = ref<DtoPermission[]>([])
  const permsLoaded = ref(false)

  /** Scope ownership by resource — mirrors policies.go (own/parent/ancestor). */
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

  /** Whether the current role has the right to the action at all. */
  function can(resource: string, action: string): boolean {
    return myPermissions.value.some((p) => p.resource === resource && p.action === action)
  }

  /** The right's scope ('' — no right). */
  function perm(resource: string, action: string): string {
    return myPermissions.value.find((p) => p.resource === resource && p.action === action)?.scope ?? ''
  }

  /** Right + object ownership by scope (owners — from the card data). */
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

  /**
   * Loads my permissions — desktop LOCAL-FIRST (read the cached copy, never
   * issue a GET from the render/guard path). The web build reads straight from
   * the server (refreshPermissions) as before the offline-first refactor.
   */
  async function loadMyPermissions(): Promise<boolean> {
    if (!isElectron) return refreshPermissions()
    if (permsLoaded.value) return true
    try {
      const cached = localStorage.getItem(PERMS_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        // Defensive: a valid-JSON non-array payload must not overwrite the ref
        // (would break rbac.can()'s .some()).
        if (Array.isArray(parsed)) myPermissions.value = parsed
      }
    } catch {
      /* cache unreadable — no permissions */
    }
    // An empty/missing/corrupt cache does NOT count as loaded: the router guard
    // falls back to the planner-role check while permsLoaded is false, and the
    // background sync (refreshPermissions) populates the list afterwards.
    permsLoaded.value = myPermissions.value.length > 0
    return permsLoaded.value
  }

  /** Network refresh of my permissions (PULL). Falls back to cache when offline. */
  async function refreshPermissions(): Promise<boolean> {
    if (isOffline.value) return loadMyPermissions()
    try {
      const resp = await new PermissionsApi(apiConfig()).permissionsMeGet()
      myPermissions.value = resp.data?.data ?? []
      permsLoaded.value = true
      try {
        localStorage.setItem(PERMS_KEY, JSON.stringify(myPermissions.value))
      } catch {
        /* localStorage may be unavailable */
      }
      return true
    } catch {
      return false
    }
  }

  /** Periodic permissions sync (TTL polling following the backend). */
  function startPermissionSync(ms = 30000): () => void {
    let timer: number | undefined
    let stopVisibility: (() => void) | undefined
    const tick = () => {
      if (!document.hidden) void refreshPermissions()
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

  /** Lightweight load of the roles catalog (for selects without a full loadRbac). */
  async function ensureRoles(): Promise<void> {
    if (roles.value.length) return
    try {
      const rolesR = await new RBACApi(apiConfig()).rbacRolesGet()
      roles.value = rolesR.data?.data ?? []
    } catch {
      // catalog unavailable — the UI works off a static role list
    }
  }

  /** Re-reads the rules and matrix after a change (an "immediate" effect). */
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

  /** Writes a rule (upsert by role+resource+action). */
  async function upsertRule(input: DtoRuleInput): Promise<boolean> {
    try {
      await new RBACApi(apiConfig()).rbacRulesPut(input)
      return true
    } catch (e) {
      setError(e)
      return false
    }
  }

  /** Soft deletion of a rule (the "no access" zone). */
  async function deleteRule(id: number): Promise<boolean> {
    try {
      await new RBACApi(apiConfig()).rbacRulesIdDelete(id)
      return true
    } catch (e) {
      setError(e)
      return false
    }
  }

  /** Creates (or revives) a role and updates the local catalog. */
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

  /** Updates a role's description. */
  async function updateRole(name: string, description: string): Promise<boolean> {
    try {
      await new RBACApi(apiConfig()).rbacRolesNamePut(name, { description })
      roles.value = roles.value.map((r) => (r.name === name ? { ...r, description } : r))
      return true
    } catch {
      return false
    }
  }

  /** Softly deletes a role (and its rules) and removes it from the local catalog. */
  async function deleteRole(name: string): Promise<boolean> {
    try {
      await new RBACApi(apiConfig()).rbacRolesNameDelete(name)
      roles.value = roles.value.filter((r) => r.name !== name)
      return true
    } catch {
      return false
    }
  }

  /** Resets the rules and route checks to the backend defaults. */
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
    refreshPermissions,
    startPermissionSync,
    reloadRules,
    upsertRule,
    deleteRule,
    resetRbac,
  }
})
