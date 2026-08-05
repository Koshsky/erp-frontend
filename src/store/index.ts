import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AuthApi, ProjectsApi, ProcessesApi, TasksApi, ResourcesApi, PlanningApi, MilestonesApi, UsersApi, AssignmentsApi, Configuration } from '@/api'
import type { DtoUserInfo, DtoProject, DtoResource, DtoCreateResourceRequest, DtoUpdateResourceRequest, JwtTokenPair } from '@/api'

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

  async function createResource(payload: DtoCreateResourceRequest): Promise<boolean> {
    resourcesError.value = null
    try {
      const api = new ResourcesApi(apiConfig())
      const resp = await api.resourcePost(payload)
      const body = resp.data
      if (body?.error) throw new Error(body.error)
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
      const api = new ResourcesApi(apiConfig())
      const resp = await api.resourceIdPut(id, patch)
      const body = resp.data
      if (body?.error) throw new Error(body.error)
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
      await new ResourcesApi(apiConfig()).resourceIdDelete(id)
      const i = resources.value.findIndex((r) => r.id === id)
      if (i >= 0) resources.value.splice(i, 1)
      return true
    } catch (e: any) {
      resourcesError.value = e.message || String(e)
      return false
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

  const totalProjects = computed(() => projects.value.length)
  const totalResources = computed(() => resources.value.length)

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
    totalProjects,
    totalResources,
    loadProjects,
    loadResources,
    loadUsers,
    createResource,
    updateResource,
    deleteResource,
  }
})

// === Planning (данные из /planning/* для трёх диаграмм) ===
export const usePlanningStore = defineStore('planning', () => {
  const projectPlanning = ref<any>(null)
  const processPlanning = ref<any>(null)
  const taskPlanning = ref<any>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadProjectPlanning(silent = false) {
    if (!silent) loading.value = true
    error.value = null
    try {
      const api = new PlanningApi(apiConfig())
      const resp = await api.planningProjectsGet()
      projectPlanning.value = resp.data?.data ?? null
    } catch (e: any) {
      if (!silent) error.value = e.message || String(e)
    } finally {
      if (!silent) loading.value = false
    }
  }

  async function loadProcessPlanning(silent = false) {
    if (!silent) loading.value = true
    error.value = null
    try {
      const api = new PlanningApi(apiConfig())
      const resp = await api.planningProcessesGet()
      processPlanning.value = resp.data?.data ?? null
    } catch (e: any) {
      if (!silent) error.value = e.message || String(e)
    } finally {
      if (!silent) loading.value = false
    }
  }

  async function loadTaskPlanning(silent = false) {
    if (!silent) loading.value = true
    error.value = null
    try {
      const api = new PlanningApi(apiConfig())
      const resp = await api.planningTasksGet()
      taskPlanning.value = resp.data?.data ?? null
    } catch (e: any) {
      if (!silent) error.value = e.message || String(e)
    } finally {
      if (!silent) loading.value = false
    }
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

  async function createProject(
    payload: {
      code: string
      start_date: string
      end_date: string
      priority?: number
    },
    index?: number,
  ): Promise<boolean> {
    const list = projectPlanning.value?.projects
    const i =
      index == null || index < 0 || index > (list?.length ?? 0) ? (list?.length ?? 0) : index
    const priority = i + 1

    const created = await postCreate(() =>
      new ProjectsApi(apiConfig()).projectPost({ ...payload, priority }),
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

    // Сдвинутые вниз проекты (позиции >= i) получают приоритет +1
    const changes: { id: number; priority: number }[] = []
    if (Array.isArray(list)) {
      for (let j = i; j < list.length; j++) {
        const p = list[j] as { id?: number; priority?: number }
        const np = j + 2
        if (p.id != null && p.priority !== np) changes.push({ id: p.id, priority: np })
      }
    }

    let saveError: string | null = null
    try {
      await Promise.all(
        changes.map((c) => new ProjectsApi(apiConfig()).projectIdPut(c.id, { priority: c.priority })),
      )
    } catch (e: any) {
      saveError = e.message || String(e)
    }

    const item = {
      id: dto.id ?? 0,
      project_code: dto.code ?? payload.code,
      start_date: dto.start_date ?? payload.start_date,
      end_date: dto.end_date ?? payload.end_date,
      priority: dto.priority ?? priority,
      owner_id: dto.owner_id,
    }
    insertAt(projectPlanning.value?.projects, i, item)
    insertAt(useAppStore().projects, i, item)

    const app = useAppStore()
    if (Array.isArray(projectPlanning.value?.projects)) {
      const plist = projectPlanning.value.projects as { priority?: number }[]
      for (let j = i; j < plist.length; j++) plist[j].priority = j + 1
    }
    if (Array.isArray(app.projects)) {
      for (const p of app.projects) {
        const c = changes.find((x) => x.id === p.id)
        if (c) p.priority = c.priority
      }
    }

    if (saveError) {
      error.value = saveError
      await loadProjectPlanning(true)
      return false
    }
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
        const resp = await new AssignmentsApi(apiConfig()).assignmentGet()
        const list = resp.data?.data ?? []
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
