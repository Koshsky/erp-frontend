/**
 * Local-first date patch of a dragged bar — projects, processes and the single
 * task/milestone fallbacks.
 *
 * The drag preview is cleared on pointer-up (`useBarDrag.endDrag`) BEFORE the
 * store learns the new dates, so a row patched only after the PUT and the
 * following silent reload makes the bar snap back to its old span and then jump
 * to the dropped one — the reported "bars jump when moving projects/processes".
 * Task bars never had the defect: `moveTask` → `persistDatePatches` already
 * mutates the rows synchronously, in the same tick as the pointer-up handler.
 *
 * What is asserted here is therefore the SYNCHRONOUS contract — the store row
 * carries the dropped span before the request promise resolves (the diagram
 * renders once, already in the new place) — plus the rollback contract: a move
 * the server rejects must not leave a fabricated span on screen (the silent
 * reload in `onError` restores the server dates).
 *
 * The generated API client is replaced by class-shaped mocks (as in
 * `index.test.ts`) and every response is shaped like the real envelope the store
 * unwraps: `{ data: { data: <payload> } }`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore, usePlanningStore } from './index'

/** Mutable per-test method implementations for the mocked API classes. */
const api = vi.hoisted(() => ({
  processIdPut: vi.fn(),
  projectIdPut: vi.fn(),
  projectGet: vi.fn(),
  milestoneIdPut: vi.fn(),
  taskIdPut: vi.fn(),
  planningProcessesGet: vi.fn(),
  planningProjectsGet: vi.fn(),
  planningTasksGet: vi.fn(),
}))

vi.mock('@/api', () => {
  class ProcessesApi {
    processIdPut(...args: unknown[]) {
      return api.processIdPut(...args)
    }
  }
  class ProjectsApi {
    projectIdPut(...args: unknown[]) {
      return api.projectIdPut(...args)
    }
    projectGet(...args: unknown[]) {
      return api.projectGet(...args)
    }
  }
  class MilestonesApi {
    milestoneIdPut(...args: unknown[]) {
      return api.milestoneIdPut(...args)
    }
  }
  class TasksApi {
    taskIdPut(...args: unknown[]) {
      return api.taskIdPut(...args)
    }
  }
  class PlanningApi {
    planningProcessesGet(...args: unknown[]) {
      return api.planningProcessesGet(...args)
    }
    planningProjectsGet(...args: unknown[]) {
      return api.planningProjectsGet(...args)
    }
    planningTasksGet(...args: unknown[]) {
      return api.planningTasksGet(...args)
    }
  }
  class Configuration {
    constructor(opts?: unknown) {
      Object.assign(this, opts ?? {})
    }
  }
  return {
    AuthApi: class {},
    ProcessesApi,
    ProjectsApi,
    MilestonesApi,
    TasksApi,
    PlanningApi,
    TimesheetResourcesApi: class {},
    TimesheetCalendarApi: class {},
    TimesheetStatesApi: class {},
    UsersApi: class {},
    AssignmentsApi: class {},
    AutoCreateApi: class {},
    RBACApi: class {},
    PermissionsApi: class {},
    AuditApi: class {},
    Configuration,
  }
})

/** Envelope of a successful GET (`refreshX` reads `resp.data.data`). */
function payload<T>(data: T): { data: { data: T } } {
  return { data: { data } }
}

/** Callbacks captured by the stubbed `window.setTimeout` (see runCoalescedRefresh) */
const scheduledTimers: Array<() => void> = []

/** Lets a fire-and-forget continuation (the rollback reload) settle. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

let planning: ReturnType<typeof usePlanningStore>
let app: ReturnType<typeof useAppStore>

/**
 * Runs the coalesced post-mutation refresh (`scheduleDomainRefresh` → 400 ms
 * debounce). The node env has no timers to wait for, so the stub collects the
 * callbacks and the tests run them explicitly — that is what makes the request
 * COUNT per aggregate assertable (the "one re-read per burst" contract).
 */
async function runCoalescedRefresh(): Promise<void> {
  const callbacks = scheduledTimers.splice(0)
  for (const cb of callbacks) cb()
  // flushDomainRefresh awaits one reloader per pending domain — let them land.
  await tick()
}

beforeAll(() => {
  // The auth store subscribes to the cross-tab session channel on creation and
  // the coalesced post-mutation refresh arms a timer — inert stubs for node.
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: (cb: () => void) => {
      scheduledTimers.push(cb)
      return scheduledTimers.length
    },
    clearTimeout: vi.fn(),
  })
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  setActivePinia(createPinia())
  planning = usePlanningStore()
  app = useAppStore()
  vi.clearAllMocks()
})

afterEach(async () => {
  // A queued flush would otherwise leak into the next test (the module keeps the
  // armed-timer flag until the flush runs).
  await runCoalescedRefresh()
})

describe('updateProcessDates — the dropped span applies before the request', () => {
  beforeEach(() => {
    planning.processPlanning = {
      projects: [
        {
          id: 1,
          start_date: '2026-01-01',
          end_date: '2026-03-01',
          processes: [{ id: 10, start_date: '2026-01-05', end_date: '2026-01-20' }],
        },
      ],
    }
  })

  it('patches the process row synchronously, then applies the echoed server row', async () => {
    api.processIdPut.mockResolvedValue(
      payload({ id: 10, start_date: '2026-01-08', end_date: '2026-01-23' }),
    )
    api.planningProcessesGet.mockResolvedValue(
      payload({
        projects: [
          {
            id: 1,
            start_date: '2026-01-01',
            end_date: '2026-03-01',
            processes: [{ id: 10, start_date: '2026-01-08', end_date: '2026-01-23' }],
          },
        ],
      }),
    )

    const pending = planning.updateProcessDates(10, '2026-01-08', '2026-01-23')

    // No await yet: the bar must already be at the drop point (one render).
    expect(planning.processPlanning?.projects?.[0]?.processes?.[0]?.start_date).toBe('2026-01-08')
    expect(planning.processPlanning?.projects?.[0]?.processes?.[0]?.end_date).toBe('2026-01-23')

    await expect(pending).resolves.toBe(true)
    // No immediate re-read: apply() uses the PUT payload.
    expect(api.planningProcessesGet).not.toHaveBeenCalled()
    expect(planning.processPlanning?.projects?.[0]?.processes?.[0]?.start_date).toBe('2026-01-08')
  })

  it('rolls the rejected span back to the server dates', async () => {
    api.processIdPut.mockRejectedValue(new Error('400: dates outside the project'))
    api.planningProcessesGet.mockResolvedValue(
      payload({
        projects: [
          {
            id: 1,
            start_date: '2026-01-01',
            end_date: '2026-03-01',
            processes: [{ id: 10, start_date: '2026-02-25', end_date: '2026-02-27' }],
          },
        ],
      }),
    )

    await expect(planning.updateProcessDates(10, '2026-02-25', '2026-03-10')).resolves.toBe(false)
    expect(planning.error).toBeTruthy()

    // The rollback reload runs in the background (fire-and-forget).
    await tick()
    expect(api.planningProcessesGet).toHaveBeenCalled()
    expect(planning.processPlanning?.projects?.[0]?.processes?.[0]?.start_date).toBe('2026-02-25')
    expect(planning.processPlanning?.projects?.[0]?.processes?.[0]?.end_date).toBe('2026-02-27')
  })
})

describe('updateProjectDates — both copies of the project take the drop at once', () => {
  beforeEach(() => {
    planning.projectPlanning = {
      projects: [{ id: 5, project_code: 'P-5', start_date: '2026-01-01', end_date: '2026-03-01' }],
    }
    // The projects table reads the app store list (same pairing as updateProjectMeta).
    app.projects = [{ id: 5, project_code: 'P-5', start_date: '2026-01-01', end_date: '2026-03-01' }]
  })

  it('patches the planning aggregate and the app store list synchronously', async () => {
    api.projectIdPut.mockResolvedValue(payload({ id: 5 }))
    api.planningProjectsGet.mockResolvedValue(
      payload({ projects: [{ id: 5, project_code: 'P-5', start_date: '2026-01-06', end_date: '2026-03-06' }] }),
    )

    const pending = planning.updateProjectDates(5, '2026-01-06', '2026-03-06')

    expect(planning.projectPlanning?.projects?.[0]?.start_date).toBe('2026-01-06')
    expect(planning.projectPlanning?.projects?.[0]?.end_date).toBe('2026-03-06')
    expect(app.projects[0]?.start_date).toBe('2026-01-06')
    expect(app.projects[0]?.end_date).toBe('2026-03-06')

    await expect(pending).resolves.toBe(true)
  })

  it('restores the server span when the move is rejected', async () => {
    api.projectIdPut.mockRejectedValue(new Error('409: conflict'))
    api.planningProjectsGet.mockResolvedValue(
      payload({ projects: [{ id: 5, project_code: 'P-5', start_date: '2026-01-01', end_date: '2026-03-01' }] }),
    )
    api.projectGet.mockResolvedValue(
      payload({ items: [{ id: 5, project_code: 'P-5', start_date: '2026-01-01', end_date: '2026-03-01' }] }),
    )

    await expect(planning.updateProjectDates(5, '2026-01-06', '2026-03-06')).resolves.toBe(false)
    expect(planning.error).toBeTruthy()

    await tick()
    expect(planning.projectPlanning?.projects?.[0]?.start_date).toBe('2026-01-01')
    expect(app.projects[0]?.start_date).toBe('2026-01-01')
  })
})

describe('the single-date fallbacks share the same contract', () => {
  beforeEach(() => {
    planning.taskPlanning = {
      processes: [
        {
          id: 1,
          tasks: [{ id: 7, start_date: '2026-01-05', end_date: '2026-01-09' }],
          milestones: [{ id: 3, date: '2026-01-05' }],
        },
      ],
    }
  })

  it('updateTaskDates (a task without its process context) applies the span synchronously', async () => {
    api.taskIdPut.mockResolvedValue(payload({ id: 7 }))
    api.planningTasksGet.mockResolvedValue(
      payload({ processes: [{ id: 1, tasks: [{ id: 7, start_date: '2026-01-12', end_date: '2026-01-16' }] }] }),
    )

    const pending = planning.updateTaskDates(7, '2026-01-12', '2026-01-16')

    expect(planning.taskPlanning?.processes?.[0]?.tasks?.[0]?.start_date).toBe('2026-01-12')
    expect(planning.taskPlanning?.processes?.[0]?.tasks?.[0]?.end_date).toBe('2026-01-16')

    await expect(pending).resolves.toBe(true)
  })

  it('updateMilestoneDate moves the marker date synchronously', async () => {
    api.milestoneIdPut.mockResolvedValue(payload({ id: 3 }))
    api.planningTasksGet.mockResolvedValue(
      payload({ processes: [{ id: 1, milestones: [{ id: 3, date: '2026-01-14' }] }] }),
    )

    const pending = planning.updateMilestoneDate(3, '2026-01-14')

    expect(planning.taskPlanning?.processes?.[0]?.milestones?.[0]?.date).toBe('2026-01-14')

    await expect(pending).resolves.toBe(true)
  })
})

describe('one re-read per aggregate per mutation (no duplicate GET)', () => {
  // The duplicate seen in the network tab came from the action's own apply()
  // refresh plus the coalesced post-mutation refresh of the SAME aggregate
  // (reloadDomainsFor). apply() now uses the PUT payload, so the aggregate is
  // re-read exactly once, by the coalesced flush — together with the aggregates
  // the server-side triggers touch (tasks/projects of a moved process).
  beforeEach(() => {
    planning.processPlanning = {
      projects: [
        {
          id: 1,
          start_date: '2026-01-01',
          end_date: '2026-03-01',
          processes: [{ id: 10, title: 'P', start_date: '2026-01-05', end_date: '2026-01-20' }],
        },
      ],
    }
    planning.projectPlanning = {
      projects: [{ id: 5, project_code: 'P-5', start_date: '2026-01-01', end_date: '2026-03-01' }],
    }
    planning.taskPlanning = {
      processes: [
        {
          id: 1,
          tasks: [
            { id: 7, start_date: '2026-01-05', end_date: '2026-01-09' },
            { id: 8, start_date: '2026-01-05', end_date: '2026-01-09' },
          ],
        },
      ],
    }
    app.projects = [{ id: 5, project_code: 'P-5', start_date: '2026-01-01', end_date: '2026-03-01' }]

    api.processIdPut.mockResolvedValue(payload({ id: 10, start_date: '2026-01-08', end_date: '2026-01-23' }))
    api.projectIdPut.mockResolvedValue(payload({ id: 5, start_date: '2026-01-06', end_date: '2026-03-06' }))
    api.taskIdPut.mockResolvedValue(payload({ id: 7, start_date: '2026-01-12', end_date: '2026-01-16' }))
    api.planningProcessesGet.mockResolvedValue(payload({ projects: [] }))
    api.planningProjectsGet.mockResolvedValue(payload({ projects: [] }))
    api.planningTasksGet.mockResolvedValue(payload({ processes: [] }))
    api.projectGet.mockResolvedValue(payload({ items: [] }))
  })

  it('a process move re-reads /planning/processes once (plus the trigger-cascade neighbours)', async () => {
    await planning.updateProcessDates(10, '2026-01-08', '2026-01-23')

    expect(api.processIdPut).toHaveBeenCalledTimes(1)
    expect(api.planningProcessesGet).not.toHaveBeenCalled()

    await runCoalescedRefresh()

    expect(api.planningProcessesGet).toHaveBeenCalledTimes(1)
    expect(api.planningTasksGet).toHaveBeenCalledTimes(1)
    expect(api.planningProjectsGet).toHaveBeenCalledTimes(1)
  })

  it('a project move re-reads /planning/projects once (plus /projects and the cascade)', async () => {
    await planning.updateProjectDates(5, '2026-01-06', '2026-03-06')

    expect(api.projectIdPut).toHaveBeenCalledTimes(1)
    expect(api.planningProjectsGet).not.toHaveBeenCalled()

    await runCoalescedRefresh()

    expect(api.planningProjectsGet).toHaveBeenCalledTimes(1)
    expect(api.projectGet).toHaveBeenCalledTimes(1)
    expect(api.planningProcessesGet).toHaveBeenCalledTimes(1)
    expect(api.planningTasksGet).toHaveBeenCalledTimes(1)
  })

  it('a process edit from the modal behaves the same way', async () => {
    await planning.updateProcessMeta(10, { title: 'renamed' })

    expect(api.planningProcessesGet).not.toHaveBeenCalled()

    await runCoalescedRefresh()

    expect(api.planningProcessesGet).toHaveBeenCalledTimes(1)
  })

  it('a burst of bar moves collapses into a single GET per aggregate', async () => {
    await planning.updateTaskDates(7, '2026-01-12', '2026-01-16')
    await planning.updateTaskDates(8, '2026-01-12', '2026-01-16')

    expect(api.taskIdPut).toHaveBeenCalledTimes(2)
    expect(api.planningTasksGet).not.toHaveBeenCalled()

    await runCoalescedRefresh()

    expect(api.planningTasksGet).toHaveBeenCalledTimes(1)
  })
})
