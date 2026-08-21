import { idbGet, idbKeys, idbPut } from './db'
import type { OutboxEntry } from './outbox'
import { applyRangeSplit } from './periodSplit'

/**
 * Write-through офлайн-дельт в «нагретые» данные (кэш GET-ответов в IndexedDB).
 *
 * Когда мутация уходит в очередь (outbox), мы сразу же применяем её к сохранённым
 * ответам API — чтобы после перезагрузки страницы в офлайне стора читала уже
 * актуальный кэш (серверный снимок + все офлайн-изменения), а не устаревший.
 *
 * Покрывает все сущности: списки (проекты/процессы/задачи/вехи/назначения/
 * ресурсы/пользователи), участников ресурсов, массивы (статусы, периоды
 * табеля) и агрегаты планировщика (/planning/projects|processes|tasks).
 * Записи, которых нет в кэше, не создаём — no-op (нечего обновлять).
 */

const CACHE_STORE = 'cache'

interface CachedBody {
  data?: unknown
  error?: unknown
}

interface CachedEntryLike {
  ts: number
  data: CachedBody
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url.split('?')[0]
  }
}

/** id из последнего сегмента пути (PUT/DELETE /entity/{id}) */
function entryId(entry: OutboxEntry): number | undefined {
  const p = pathnameOf(entry.url).replace(/\/+$/, '')
  const seg = p.split('/').pop() ?? ''
  const n = Number(seg)
  return Number.isFinite(n) ? n : undefined
}

/** Пройти по записям кэша, применить мутацию к data, записать при изменении */
async function forEachCacheKey(
  match: (path: string) => boolean,
  mutate: (body: CachedBody) => void,
): Promise<void> {
  const keys = await idbKeys(CACHE_STORE)
  for (const key of keys) {
    if (!match(pathnameOf(key))) continue
    const cached = await idbGet<CachedEntryLike>(CACHE_STORE, key)
    if (!cached || typeof cached.data !== 'object' || cached.data == null) continue
    const before = JSON.stringify(cached.data)
    mutate(cached.data)
    if (JSON.stringify(cached.data) !== before) {
      await idbPut(CACHE_STORE, key, cached)
    }
  }
}

/** Мутация для листинга { items, total } */
function applyListMutation(
  payload: { items: any[]; total?: number },
  entry: OutboxEntry,
  makeItem: (body: any, tempId?: number) => any,
): void {
  const items = payload.items
  const id = entryId(entry)
  const method = (entry.method || '').toUpperCase()
  switch (method) {
    case 'POST': {
      const item = makeItem(entry.body, entry.tempId)
      if (item && !items.some((x) => x.id === item.id)) {
        items.push(item)
        payload.total = (payload.total ?? items.length - 1) + 1
      }
      break
    }
    case 'PUT': {
      if (id == null) break
      const i = items.findIndex((x) => x.id === id)
      if (i >= 0) items[i] = { ...items[i], ...(entry.body ?? {}) }
      break
    }
    case 'DELETE': {
      if (id == null) break
      const i = items.findIndex((x) => x.id === id)
      if (i >= 0) {
        items.splice(i, 1)
        payload.total = Math.max(0, (payload.total ?? 0) - 1)
      }
      break
    }
    default:
      break
  }
}

function listApplier(path: string, make: (b: any, tempId?: number) => any) {
  return (entry: OutboxEntry): Promise<void> =>
    forEachCacheKey((p) => p === path, (body) => {
      const data = body.data as { items?: any[]; total?: number } | undefined
      if (!data || !Array.isArray(data.items)) return
      applyListMutation(data as { items: any[]; total?: number }, entry, make)
    })
}

// Синтез создаваемых объектов из тела запроса (с временным id)
const makeResource = (b: any, tempId?: number) => ({
  id: tempId ?? -1,
  code: b?.code,
  title: b?.title,
  owner_id: b?.owner_id,
  employees_count: 0,
})
const makeEmployee = (b: any, tempId?: number) => ({
  id: tempId ?? -1,
  name: b?.name,
  role: b?.role ?? 'worker',
  position: b?.position,
  manager_id: b?.manager_id,
  hire_date: b?.hire_date,
  termination_date: b?.termination_date,
  username: b?.username,
})
const makeProject = (b: any, tempId?: number) => ({
  id: tempId ?? -1,
  code: b?.code,
  start_date: b?.start_date,
  end_date: b?.end_date,
  priority: b?.priority ?? 100,
  owner_id: b?.owner_id,
})
const makeProcess = (b: any, tempId?: number) => ({
  id: tempId ?? -1,
  title: b?.title,
  project_id: b?.project_id,
  start_date: b?.start_date,
  end_date: b?.end_date,
  owner_id: b?.owner_id,
})
const makeTask = (b: any, tempId?: number) => ({
  id: tempId ?? -1,
  title: b?.title,
  process_id: b?.process_id,
  start_date: b?.start_date,
  end_date: b?.end_date,
  resources: [],
})
const makeMilestone = (b: any, tempId?: number) => ({
  id: tempId ?? -1,
  title: b?.title,
  content: b?.content ?? '',
  date: b?.date,
  process_id: b?.process_id,
})
const makeAssignment = (b: any, tempId?: number) => ({
  id: tempId ?? -1,
  task_id: b?.task_id,
  resource_id: b?.resource_id,
  quantity: b?.quantity,
})

/** Агрегат /planning/projects: проекты с приоритетом */
async function applyPlanningProjects(entry: OutboxEntry): Promise<void> {
  const body = entry.body as Record<string, any> | undefined
  const method = (entry.method || '').toUpperCase()
  await forEachCacheKey((p) => p === '/api/v1/planning/projects', (cachedBody) => {
    const data = cachedBody.data as { projects?: any[] } | undefined
    const projects = data?.projects
    if (!Array.isArray(projects)) return
    const id = entryId(entry)
    if (method === 'POST') {
      const item = {
        id: entry.tempId ?? -1,
        project_code: body?.code,
        start_date: body?.start_date,
        end_date: body?.end_date,
        priority: body?.priority ?? 100,
        owner_id: body?.owner_id,
      }
      if (!projects.some((p) => p.id === item.id)) projects.push(item)
    } else if (method === 'PUT') {
      if (id == null) return
      const i = projects.findIndex((p) => p.id === id)
      if (i >= 0) projects[i] = { ...projects[i], ...(body ?? {}) }
    } else if (method === 'DELETE') {
      if (id == null) return
      const i = projects.findIndex((p) => p.id === id)
      if (i >= 0) projects.splice(i, 1)
    }
  })
}

/** Агрегат /planning/processes: процессы внутри проектов */
async function applyPlanningProcesses(entry: OutboxEntry): Promise<void> {
  const body = entry.body as Record<string, any> | undefined
  const method = (entry.method || '').toUpperCase()
  await forEachCacheKey((p) => p === '/api/v1/planning/processes', (cachedBody) => {
    const data = cachedBody.data as any
    const projects = data?.projects as any[] | undefined
    if (!Array.isArray(projects)) return
    const id = entryId(entry)
    if (method === 'POST') {
      const pid = body?.project_id
      const pr = projects.find((p) => p.id === pid)
      if (!pr) return
      pr.processes = pr.processes ?? []
      const item = {
        id: entry.tempId ?? -1,
        title: body?.title,
        start_date: body?.start_date,
        end_date: body?.end_date,
        project_id: pid,
        owner_id: undefined,
      }
      if (!pr.processes.some((x: any) => x.id === item.id)) pr.processes.push(item)
    } else if (method === 'PUT') {
      if (id == null) return
      for (const pr of projects) {
        const i = (pr.processes ?? []).findIndex((x: any) => x.id === id)
        if (i >= 0) {
          pr.processes[i] = { ...pr.processes[i], ...(body ?? {}) }
          return
        }
      }
    } else if (method === 'DELETE') {
      if (id == null) return
      for (const pr of projects) {
        const i = (pr.processes ?? []).findIndex((x: any) => x.id === id)
        if (i >= 0) {
          pr.processes.splice(i, 1)
          return
        }
      }
    }
  })
}

/** Агрегат /planning/tasks: задачи/вехи/назначения внутри процессов */
async function applyPlanningTasks(
  entry: OutboxEntry,
  kind: 'task' | 'milestone' | 'assignment',
): Promise<void> {
  const body = entry.body as Record<string, any> | undefined
  const method = (entry.method || '').toUpperCase()
  // Код/название ресурса для бейджа задачи при офлайн-назначении (из кэша справочника)
  const resourceFields =
    kind === 'assignment' && method === 'POST'
      ? await getResourceFields(body?.resource_id as number | undefined)
      : {}
  await forEachCacheKey((p) => p === '/api/v1/planning/tasks', (cachedBody) => {
    const data = cachedBody.data as any
    const processes = data?.processes as any[] | undefined
    if (!Array.isArray(processes)) return
    const id = entryId(entry)

    if (kind === 'task') {
      if (method === 'POST') {
        const pid = body?.process_id
        const pr = processes.find((p) => p.id === pid)
        if (!pr) return
        pr.tasks = pr.tasks ?? []
        const item = {
          id: entry.tempId ?? -1,
          title: body?.title,
          start_date: body?.start_date,
          end_date: body?.end_date,
          resources: [],
        }
        if (!pr.tasks.some((x: any) => x.id === item.id)) pr.tasks.push(item)
      } else if (method === 'PUT') {
        if (id == null) return
        for (const pr of processes) {
          const i = (pr.tasks ?? []).findIndex((x: any) => x.id === id)
          if (i >= 0) {
            pr.tasks[i] = { ...pr.tasks[i], ...(body ?? {}) }
            return
          }
        }
      } else if (method === 'DELETE') {
        if (id == null) return
        for (const pr of processes) {
          const i = (pr.tasks ?? []).findIndex((x: any) => x.id === id)
          if (i >= 0) {
            pr.tasks.splice(i, 1)
            return
          }
        }
      }
    } else if (kind === 'milestone') {
      if (method === 'POST') {
        const pid = body?.process_id
        const pr = processes.find((p) => p.id === pid)
        if (!pr) return
        pr.milestones = pr.milestones ?? []
        const item = {
          id: entry.tempId ?? -1,
          title: body?.title,
          content: body?.content ?? '',
          date: body?.date,
        }
        if (!pr.milestones.some((x: any) => x.id === item.id)) pr.milestones.push(item)
      } else if (method === 'PUT') {
        if (id == null) return
        for (const pr of processes) {
          const i = (pr.milestones ?? []).findIndex((x: any) => x.id === id)
          if (i >= 0) {
            pr.milestones[i] = { ...pr.milestones[i], ...(body ?? {}) }
            return
          }
        }
      } else if (method === 'DELETE') {
        if (id == null) return
        for (const pr of processes) {
          const i = (pr.milestones ?? []).findIndex((x: any) => x.id === id)
          if (i >= 0) {
            pr.milestones.splice(i, 1)
            return
          }
        }
      }
    } else if (kind === 'assignment') {
      if (method === 'POST') {
        const taskId = body?.task_id
        for (const pr of processes) {
          const t = (pr.tasks ?? []).find((x: any) => x.id === taskId)
          if (!t) continue
          t.resources = t.resources ?? []
          if (!t.resources.some((r: any) => r.id === body?.resource_id)) {
            t.resources.push({
              id: body?.resource_id,
              assignment_id: entry.tempId ?? -1,
              quantity: body?.quantity,
              code: resourceFields.code as string | undefined,
              title: resourceFields.title as string | undefined,
            })
          }
          return
        }
      } else if (method === 'DELETE') {
        if (id == null) return
        for (const pr of processes) {
          for (const t of pr.tasks ?? []) {
            const i = (t.resources ?? []).findIndex((r: any) => r.assignment_id === id)
            if (i >= 0) {
              t.resources.splice(i, 1)
              return
            }
          }
        }
      }
    }
  })
}

/** Массив /timesheet/states */
async function applyState(entry: OutboxEntry): Promise<void> {
  const body = entry.body as Record<string, any> | undefined
  const method = (entry.method || '').toUpperCase()
  await forEachCacheKey((p) => p === '/api/v1/timesheet/states', (cachedBody) => {
    const data = cachedBody.data as any[] | undefined
    if (!Array.isArray(data)) return
    const id = entryId(entry)
    if (method === 'POST') {
      const item = { id: entry.tempId ?? -1, ...(body ?? {}) }
      if (!data.some((s) => s.id === item.id)) data.push(item)
    } else if (method === 'PUT') {
      if (id == null) return
      const i = data.findIndex((s) => s.id === id)
      if (i >= 0) data[i] = { ...data[i], ...(body ?? {}) }
    } else if (method === 'DELETE') {
      if (id == null) return
      const i = data.findIndex((s) => s.id === id)
      if (i >= 0) data.splice(i, 1)
    }
  })
}

function parseEmployeeDays(entry: OutboxEntry): {
  employeeId?: number
  start?: string
  end?: string
  stateId?: number
} {
  try {
    // В проде URL запроса относительный (basePath /api/v1) — без base
    // new URL() бросает, и дельты табеля молча не применялись.
    const u = new URL(entry.url, 'https://mvs.local')
    const m = u.pathname.match(/\/user\/(\d+)\/days/)
    const stateRaw = u.searchParams.get('state_id')
    const stateN = stateRaw ? Number(stateRaw) : NaN
    return {
      employeeId: m ? Number(m[1]) : undefined,
      start: u.searchParams.get('start_date') ?? undefined,
      end: u.searchParams.get('end_date') ?? undefined,
      stateId: Number.isFinite(stateN) ? stateN : undefined,
    }
  } catch {
    return {}
  }
}

/** Полная информация статуса из кэша состояний (для аббревиатуры/цвета ячейки) */
async function getStateFields(stateId: number | undefined): Promise<Record<string, unknown>> {
  if (stateId == null) return {}
  const keys = await idbKeys(CACHE_STORE)
  for (const key of keys) {
    if (pathnameOf(key) !== '/api/v1/timesheet/states') continue
    const cached = await idbGet<{ data: { data?: any[] } }>(CACHE_STORE, key)
    const arr = cached?.data?.data
    if (Array.isArray(arr)) {
      const st = arr.find((s) => s.id === stateId)
      if (st) {
        return { state_code: st.code, state_name: st.name, is_available: st.is_available }
      }
    }
    break
  }
  return {}
}

/** Код/название ресурса из кэша справочника /api/v1/resources (для бейджа задачи) */
async function getResourceFields(resourceId: number | undefined): Promise<Record<string, unknown>> {
  if (resourceId == null) return {}
  const keys = await idbKeys(CACHE_STORE)
  for (const key of keys) {
    if (pathnameOf(key) !== '/api/v1/resources') continue
    const cached = await idbGet<{ data: { data?: any[] } }>(CACHE_STORE, key)
    const arr = cached?.data?.data
    if (Array.isArray(arr)) {
      const r = arr.find((x) => x.id === resourceId)
      if (r) {
        return { code: r.code, title: r.title }
      }
    }
    break
  }
  return {}
}

/** Периоды табеля /user/{id}/days (окна кэшируются по диапазонам) */
async function applyPeriod(entry: OutboxEntry): Promise<void> {
  const { employeeId, start, end, stateId } = parseEmployeeDays(entry)
  if (employeeId == null) return
  const body = entry.body as Record<string, any> | undefined
  const method = (entry.method || '').toUpperCase()
  const prefix = `/api/v1/user/${employeeId}/days`
  const enrichment =
    method === 'PUT' ? await getStateFields(body?.state_id as number | undefined) : {}
  await forEachCacheKey((p) => p === prefix, (cachedBody) => {
    const data = cachedBody.data as any[] | undefined
    if (!Array.isArray(data)) return
    if (method === 'PUT') {
      const s = body?.start_date as string | undefined
      const e = body?.end_date as string | undefined
      if (!s || !e) return
      // Разбиение как на бэкенде: вычитаем [s,e], хвосты сохраняем.
      cachedBody.data = applyRangeSplit(data, 'put', s, e, undefined, {
        id: -entry.ts,
        state_id: body?.state_id,
        state_code: enrichment.state_code as string | undefined,
        state_name: enrichment.state_name as string | undefined,
        is_available: enrichment.is_available as boolean | undefined,
      })
    } else if (method === 'DELETE') {
      if (!start || !end) return
      cachedBody.data = applyRangeSplit(data, 'delete', start, end, stateId)
    }
  })
}

/** Поля пользователя из кэша справочника /api/v1/users (для офлайн-добавления в ресурс) */
async function getUserFields(userId: number | undefined): Promise<Record<string, unknown>> {
  if (userId == null) return {}
  const keys = await idbKeys(CACHE_STORE)
  for (const key of keys) {
    if (pathnameOf(key) !== '/api/v1/user') continue
    const cached = await idbGet<{ data: { data?: { items?: any[] } } }>(CACHE_STORE, key)
    const u = cached?.data?.data?.items?.find((x) => x.id === userId)
    if (u) {
      return {
        name: u.name,
        role: u.role,
        position: u.position,
        manager_id: u.manager_id,
        hire_date: u.hire_date,
        termination_date: u.termination_date,
      }
    }
    break
  }
  return {}
}

/** Массив участников ресурса /api/v1/resources/{id}/members */
async function applyMembers(entry: OutboxEntry): Promise<void> {
  const body = entry.body as Record<string, any> | undefined
  const method = (entry.method || '').toUpperCase()
  const path = pathnameOf(entry.url).replace(/\/+$/, '')
  const m = path.match(/\/api\/v1\/resources\/(\d+)\/members(?:\/(\d+))?$/)
  if (!m) return
  const resourceId = Number(m[1])
  const userId = m[2] ? Number(m[2]) : undefined
  const fields = method === 'POST' ? await getUserFields(body?.user_id as number | undefined) : {}
  await forEachCacheKey((p) => p === `/api/v1/resources/${resourceId}/members`, (cachedBody) => {
    const data = cachedBody.data as any[] | undefined
    if (!Array.isArray(data)) return
    if (method === 'POST') {
      const item = { id: body?.user_id ?? entry.tempId ?? -1, ...fields }
      if (!data.some((x) => x.id === item.id)) data.push(item)
    } else if (method === 'DELETE' && userId != null) {
      const i = data.findIndex((x) => x.id === userId)
      if (i >= 0) data.splice(i, 1)
    }
  })
  // Счётчик участников в справочнике ресурсов
  if (method === 'POST' || method === 'DELETE') {
    await forEachCacheKey((p) => p === '/api/v1/resources', (cachedBody) => {
      const data = cachedBody.data as { items?: any[] } | undefined
      const res = data?.items?.find((r) => r.id === resourceId)
      if (!res) return
      if (method === 'POST') res.employees_count = (res.employees_count ?? 0) + 1
      else res.employees_count = Math.max(0, (res.employees_count ?? 0) - 1)
    })
  }
}

/**
 * Применяет офлайн-дельту к сохранённым GET-ответам. Вызывается при каждой
 * записи в очередь. Ошибки не критичны — кэш просто не обновится.
 */
export async function applyToCache(entry: OutboxEntry): Promise<void> {
  try {
    console.log(`[offline] applyToCache: ${(entry.method || '').toUpperCase()} ${entry.url}`)
    switch (entry.entity) {
      case 'resource':
        await listApplier('/api/v1/resources', makeResource)(entry)
        break
      case 'user':
        await listApplier('/api/v1/user', makeEmployee)(entry)
        break
      case 'member':
        await applyMembers(entry)
        break
      case 'state':
        await applyState(entry)
        break
      case 'period':
        await applyPeriod(entry)
        break
      case 'project':
        await listApplier('/api/v1/project', makeProject)(entry)
        await applyPlanningProjects(entry)
        break
      case 'process':
        await listApplier('/api/v1/process', makeProcess)(entry)
        await applyPlanningProcesses(entry)
        break
      case 'task':
        await listApplier('/api/v1/task', makeTask)(entry)
        await applyPlanningTasks(entry, 'task')
        break
      case 'milestone':
        await listApplier('/api/v1/milestone', makeMilestone)(entry)
        await applyPlanningTasks(entry, 'milestone')
        break
      case 'assignment':
        await listApplier('/api/v1/assignment', makeAssignment)(entry)
        await applyPlanningTasks(entry, 'assignment')
        break
      default:
        break
    }
  } catch {
    // правка кэша не критична — при сбое не обновится
  }
}
