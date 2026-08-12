import { ref, watch } from 'vue'
import { useAppStore, useAuthStore, usePlanningStore, useTimesheetStore } from '@/store'
import { flushOutbox, pendingCount, refreshPendingCount, type MutationEntity } from './outbox'
import { isOffline } from './state'

/**
 * Синхронизация офлайн-очереди: при появлении сети (и при старте приложения
 * с сохранённой очередью) отправляет накопленные мутации в бэкенд, затем
 * перечитывает затронутые домены с сервера — серверная правда побеждает,
 * а изменения, которые применить не удалось, визуально откатываются.
 */

export interface SyncNoticeData {
  ok: number
  failed: number
  interrupted: boolean
}

/** Результат последней синхронизации (показывается тостом) */
export const syncNotice = ref<SyncNoticeData | null>(null)

export function dismissSyncNotice(): void {
  syncNotice.value = null
}

let reconciling = false

interface Reloader {
  name: string
  run: () => Promise<unknown>
}

function reload(name: string, run: () => Promise<unknown>): Reloader {
  return { name, run }
}

/** Набор перечитываний данных под роль (тяжёлые — по мере необходимости) */
function reloadersFor(entity: MutationEntity): Reloader[] {
  const app = useAppStore()
  const planning = usePlanningStore()
  const ts = useTimesheetStore()
  const auth = useAuthStore()
  const isStaff = auth.user?.role === 'vp' || auth.user?.role === 'admin'

  switch (entity) {
    case 'resource':
      return [reload('resources', () => app.loadResources()), reload('calendar', () => app.loadCalendar())]
    case 'employee':
      return isStaff ? [reload('employees', () => ts.loadEmployees())] : []
    case 'state':
      return isStaff ? [reload('states', () => ts.loadStates())] : []
    case 'period':
      return isStaff ? [reload('periods', () => ts.loadEmployees())] : []
    case 'project':
      return [reload('project-plan', () => planning.loadProjectPlanning()), reload('projects', () => app.loadProjects())]
    case 'process':
      return [reload('process-plan', () => planning.loadProcessPlanning())]
    case 'task':
    case 'milestone':
    case 'assignment':
      return [reload('task-plan', () => planning.loadTaskPlanning())]
    case 'reorder':
      return [reload('project-plan', () => planning.loadProjectPlanning()), reload('projects', () => app.loadProjects())]
    default:
      return []
  }
}

async function reconcile(entities: Set<MutationEntity>): Promise<void> {
  const runs = new Map<string, () => Promise<unknown>>()
  for (const entity of entities) {
    for (const r of reloadersFor(entity)) {
      if (!runs.has(r.name)) runs.set(r.name, r.run)
    }
  }
  for (const run of runs.values()) {
    try {
      await run()
    } catch {
      // отдельное перечитывание упало — данные подтянутся при следующем обращении
    }
  }
}

async function runSync(): Promise<void> {
  if (reconciling) return
  reconciling = true
  try {
    const res = await flushOutbox()
    if (res.ok > 0 || res.failed > 0 || res.interrupted) {
      await reconcile(res.entities)
      syncNotice.value = { ok: res.ok, failed: res.failed, interrupted: res.interrupted }
    }
  } finally {
    reconciling = false
  }
}

/** Интервал поллинга очереди для «тихого» возврата сети (без события online) */
const SYNC_POLL_MS = 15000

/** Инициализация: реконсил при старте с очередью + триггер на возврат сети */
export function initOfflineSync(): void {
  void refreshPendingCount()
  watch(isOffline, (offline) => {
    if (!offline) void runSync()
  })
  if (!isOffline.value) {
    void refreshPendingCount().then(() => {
      if (pendingCount.value > 0) void runSync()
    })
  }
  // Интернет может вернуться без события online (интерфейс всё время «up»).
  // runSync сам проверит доступность сервера (probe в flushOutbox), так что
  // поллинг безопасен и дешёв — работает только пока есть очередь.
  window.setInterval(() => {
    if (pendingCount.value > 0 && !isOffline.value) void runSync()
  }, SYNC_POLL_MS)
}
