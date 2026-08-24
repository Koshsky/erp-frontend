import { ref, watch } from 'vue'
import { useAppStore, useAuthStore, usePlanningStore, useTimesheetStore } from '@/store'
import { shouldAutoSync } from '@/settings'
import { isElectron } from '@/electron'
import { getSyncCredentials } from '@/syncCredentials'
import { isLoggedOut } from '@/loggedOut'
import { warmNow } from './warmup'
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

const LAST_PUSH_KEY = 'mvs_erp_last_push_at'

function readLastPush(): number | null {
  try {
    const raw = localStorage.getItem(LAST_PUSH_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** Время последней удачной отправки очереди (для UI; переживает перезагрузки) */
export const lastPushAt = ref<number | null>(readLastPush())

function noteLastPush(): void {
  lastPushAt.value = Date.now()
  try {
    localStorage.setItem(LAST_PUSH_KEY, String(lastPushAt.value))
  } catch {
    // метка не критична — при следующем прогоне обновится
  }
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
      if (res.ok > 0) noteLastPush()
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

/**
 * Кнопка «Синхронизировать всё»: PUSH (отправка очереди) затем, если сеть
 * жива, PULL (прогревка офлайн-кэша). Части независимы: упавшая не роняет
 * вторую. Возвращает, что реально выполнилось (для сообщения в UI).
 */
export async function syncAll(): Promise<{ pushed: boolean; pulled: boolean }> {
  try {
    await runSync()
    const n = syncNotice.value
    const pushed = n != null && (n.ok > 0 || n.failed > 0 || n.interrupted)
    let pulled = false
    if (!isOffline.value) {
      pulled = await warmNow()
    }
    return { pushed, pulled }
  } finally {
    // runSync/warmNow сами сбрасывают свои блокировки и прогресс
  }
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
    // После явного выхода (logout) автосинк не запускаем до ручного входа
    if (!offline && shouldAutoSync() && !isLoggedOut()) void runSync()
  })
  if (!isOffline.value) {
    void refreshPendingCount().then(() => {
      if (shouldAutoSync() && !isLoggedOut() && pendingCount.value > 0) void runSync()
    })
  }
  // Интернет может вернуться без события online (интерфейс всё время «up»).
  // runSync сам проверит доступность сервера (probe в flushOutbox), так что
  // поллинг безопасен и дешёв — работает только пока есть очередь.
  window.setInterval(() => {
    if (shouldAutoSync() && !isLoggedOut() && pendingCount.value > 0 && !isOffline.value) void runSync()
  }, SYNC_POLL_MS)
}

/**
 * Авторелогin для настольной версии (Electron).
 * Если автосинк включён, сессии нет (токены протухли/отсутствуют) и в
 * safeStorage сохранены логин+пароль — тихо входим, чтобы автосинк мог
 * работать без ручного ввода. В браузере (нет safeStorage) ничего не делает.
 * После явного выхода (флаг mvs_erp_logged_out) не входит до ручного входа.
 */
export async function ensureDesktopAutoSyncSession(): Promise<void> {
  if (!isElectron || !shouldAutoSync()) return
  if (isLoggedOut()) return
  const auth = useAuthStore()
  // Сессия уже жива — не трогаем.
  if (auth.isAuthenticated && !auth.accessExpired) return
  if (isOffline.value) return
  const creds = await getSyncCredentials()
  if (!creds?.login || !creds.password) return
  await auth.login(creds.login, creds.password)
}

/** Период фоновой поддержки сессии (продление access-токена тихим входом) */
const SESSION_MAINTENANCE_MS = 30 * 1000

let maintenanceTimer: number | null = null

/**
 * Фоновая поддержка сессии в Desktop: каждые 30 с тихо обновляем access-токен
 * по кредам автосинка, когда он на исходе (refresh-кука не работает
 * кросс-сайт, поэтому продлеваем входом). Идемпотентна: ensure... сам
 * отсекает свежую сессию, офлайн и флаг «после выхода». Офлайн-сессия
 * (вход без сети) автоматически становится реальной при возврате сети.
 */
export function startSessionMaintenance(): void {
  if (!isElectron || maintenanceTimer != null) return
  maintenanceTimer = window.setInterval(() => {
    void ensureDesktopAutoSyncSession()
  }, SESSION_MAINTENANCE_MS)
}
