import { ref, watch } from 'vue'
import { useAppStore, useAuthStore, usePlanningStore, useTimesheetStore } from '@/store'
import { shouldAutoSync } from '@/settings'
import { isElectron } from '@/electron'
import { getSyncCredentials } from '@/syncCredentials'
import {
  flushOutbox,
  pendingCount,
  refreshPendingCount,
  replayOutboxToCache,
  resetFailedRetries,
  type FailedSyncItem,
  type MutationEntity,
} from './outbox'
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
  /** Неотправленные записи с причинами (для тоста) */
  failedEntries: FailedSyncItem[]
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
    case 'user':
      return isStaff ? [reload('employees', () => ts.loadEmployees())] : []
    case 'member':
      return isStaff ? [reload('resources', () => app.loadResources())] : []
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
      syncNotice.value = {
        ok: res.ok,
        failed: res.failed,
        interrupted: res.interrupted,
        failedEntries: res.failedEntries,
      }
    }
  } finally {
    reconciling = false
  }
}

/**
 * Кнопка «PUSH» на экране синхронизации: отправка очереди + reconcile.
 * Синхронный вызов внутри приложения (автосинк) идёт через initOfflineSync.
 */
export function syncNow(): Promise<void> {
  return runSync()
}

/** Кнопка «Повторить»: снимаем карантин и пробуем отправить снова */
export async function retryFailed(): Promise<void> {
  await resetFailedRetries()
  await runSync()
}

/** Кнопка «Пропустить»: удаляем отвергнутые записи (см. outbox) */
export { discardFailed } from './outbox'

/** Интервал поллинга очереди для «тихого» возврата сети (без события online) */
const SYNC_POLL_MS = 15000

/** Инициализация: реконсил при старте с очередью + триггер на возврат сети */
export async function initOfflineSync(): Promise<void> {
  // Write-through в кэш ДО первой загрузки данных (main.ts ждёт эту функцию):
  // офлайн-перезагрузка показывает несинхронизированные изменения очереди.
  await replayOutboxToCache()
  void refreshPendingCount()
  watch(isOffline, (offline) => {
    if (!offline && shouldAutoSync()) void runSync()
  })
  if (!isOffline.value) {
    void refreshPendingCount().then(() => {
      if (shouldAutoSync() && pendingCount.value > 0) void runSync()
    })
  }
  // Интернет может вернуться без события online (интерфейс всё время «up»).
  // runSync сам проверит доступность сервера (probe в flushOutbox), так что
  // поллинг безопасен и дешёв — работает только пока есть очередь.
  window.setInterval(() => {
    if (shouldAutoSync() && pendingCount.value > 0 && !isOffline.value) void runSync()
  }, SYNC_POLL_MS)
}

/**
 * Авторелогin для настольной версии (Electron).
 * Если автосинк включён, сессии нет (токены протухли/отсутствуют) и в
 * safeStorage сохранены логин+пароль — тихо входим, чтобы автосинк мог
 * работать без ручного ввода. В браузере (нет safeStorage) ничего не делает.
 */
export async function ensureDesktopAutoSyncSession(): Promise<void> {
  if (!isElectron || !shouldAutoSync()) return
  const auth = useAuthStore()
  // Сессия уже жива — не трогаем.
  if (auth.isAuthenticated && !auth.accessExpired) return
  if (isOffline.value) return
  const creds = await getSyncCredentials()
  if (!creds?.login || !creds.password) return
  await auth.login(creds.login, creds.password)
}
