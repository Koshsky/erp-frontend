/**
 * Pure-logic unit tests for the outbox mutation queue (src/offline/outbox.ts).
 *
 * Runs in the vitest `unit` node project: all browser/IndexedDB dependencies
 * (db.ts, state.ts, cacheApply.ts, config.ts, token.ts, axios) are replaced
 * with in-memory fakes, so the queue semantics themselves are exercised
 * deterministically:
 *  - enqueue dedup (method+url+body equality);
 *  - temp-id → real-id mapping (idmap) applied to dependent queue entries;
 *  - idempotent drop of DELETE answered 404/410;
 *  - FIFO flush ordering by ts (entries are sorted, not send-in-map-order);
 *  - quarantine/backoff gate retries without deleting entries.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** In-memory fake replacing the IndexedDB layer (offline/db.ts). */
const fake = vi.hoisted(() => {
  const stores: Record<string, Map<string, unknown>> = {
    outbox: new Map<string, unknown>(),
    idmap: new Map<string, unknown>(),
    cache: new Map<string, unknown>(),
  }
  const store = (name: string): Map<string, unknown> => {
    stores[name] ??= new Map<string, unknown>()
    return stores[name]
  }
  const reset = (): void => {
    for (const m of Object.values(stores)) m.clear()
  }
  return { store, reset }
})

/** Shared axios mock: the default axios export is a callable instance fn. */
const axiosCall = vi.hoisted(() => {
  const fn = vi.fn()
  return { fn }
})

vi.mock('./db', () => ({
  IDMAP_STORE_NAME: 'idmap',
  idbPut: vi.fn(async (s: string, k: string, v: unknown) => {
    fake.store(s).set(k, v)
  }),
  idbGet: vi.fn(async (s: string, k: string) => fake.store(s).get(k)),
  idbDel: vi.fn(async (s: string, k: string) => {
    fake.store(s).delete(k)
  }),
  idbAll: vi.fn(async (s: string) => [...fake.store(s).values()]),
  idbCount: vi.fn(async (s: string) => fake.store(s).size),
  idbKeys: vi.fn(async (s: string) => [...fake.store(s).keys()]),
}))

vi.mock('./state', () => ({
  probeBackend: vi.fn(async () => true),
}))
vi.mock('./cacheApply', () => ({
  applyToCache: vi.fn(async () => {
    /* no-op write-through overlay */
  }),
}))
vi.mock('@/config', () => ({
  getApiUrl: vi.fn(() => 'http://api.test/api/v1'),
}))
vi.mock('../token', () => ({
  getAccessToken: vi.fn(() => ''),
}))
vi.mock('axios', () => ({
  default: axiosCall.fn,
}))

import { enqueueMutation, flushOutbox, clearOutbox, type OutboxEntry } from './outbox'
import { idbPut, idbDel, idbAll } from './db'

const okResponse = { data: { data: {} } }

function httpError(status: number, message?: string): { response: { status: number }; message: string } {
  return { response: { status }, message: message ?? `Request failed with status code ${status}` }
}

/** Seeds the outbox store directly with an entry (full control over ts). */
function seed(entry: Partial<OutboxEntry> & Pick<OutboxEntry, 'id' | 'ts' | 'method' | 'url' | 'entity'>): void {
  fake.store('outbox').set(entry.id, entry as OutboxEntry)
}

beforeEach(() => {
  fake.reset()
  vi.clearAllMocks()
  axiosCall.fn.mockResolvedValue(okResponse)
})

describe('enqueueMutation — dedup and persistence', () => {
  it('does not enqueue a duplicate (same method+url+body) twice', async () => {
    const entry = {
      entity: 'resource' as const,
      method: 'POST' as const,
      url: 'http://api.test/api/v1/resource',
      body: { title: 'Токарный станок', code: 'R-1' },
    }
    await enqueueMutation(entry)
    await enqueueMutation(entry)
    expect(fake.store('outbox').size).toBe(1)
    // The same object typed as a JSON string is normalized and also deduped.
    await enqueueMutation({
      ...entry,
      body: JSON.stringify({ title: 'Токарный станок', code: 'R-1' }),
    })
    expect(fake.store('outbox').size).toBe(1)
  })

  it('enqueues a sibling mutation when the body differs', async () => {
    await enqueueMutation({
      entity: 'resource' as const,
      method: 'POST' as const,
      url: 'http://api.test/api/v1/resource',
      body: { title: 'А' },
    })
    await enqueueMutation({
      entity: 'resource' as const,
      method: 'POST' as const,
      url: 'http://api.test/api/v1/resource',
      body: { title: 'Б' },
    })
    expect(fake.store('outbox').size).toBe(2)
  })

  it('enqueues separately when the method or url differs', async () => {
    await enqueueMutation({
      entity: 'resource' as const,
      method: 'PUT' as const,
      url: 'http://api.test/api/v1/resource/1',
      body: { title: 'X' },
    })
    await enqueueMutation({
      entity: 'resource' as const,
      method: 'PUT' as const,
      url: 'http://api.test/api/v1/resource/2',
      body: { title: 'X' },
    })
    expect(fake.store('outbox').size).toBe(2)
  })
})

describe('flushOutbox — temp-id → real-id mapping (idmap)', () => {
  it('rewrites dependent entry urls/bodies with the real id returned by the create', async () => {
    let call = 0
    axiosCall.fn.mockImplementation(async (config: { url: string }) => {
      call++
      if (call === 1) {
        // The create answers with the real entity id.
        return { data: { data: { id: 42 } } }
      }
      return okResponse
    })

    seed({ id: 'create', ts: 100, method: 'POST', url: 'http://api.test/api/v1/user', body: { name: 'Новичок' }, entity: 'user', tempId: -1700000000000 })
    seed({
      id: 'dep',
      ts: 200,
      method: 'PUT',
      url: 'http://api.test/api/v1/user/-1700000000000/days',
      body: { user_id: -1700000000000 },
      entity: 'user',
    })

    const result = await flushOutbox()

    expect(result.ok).toBe(2)
    expect(result.failed).toBe(0)
    // The mapping was persisted to IndexedDB BEFORE the creator entry was deleted.
    expect(vi.mocked(idbPut).mock.calls.some(([store, key]) => store === 'idmap' && key === '-1700000000000')).toBe(true)
    // The dependent entry went out with the REAL id in both the url and the body.
    const depCall = axiosCall.fn.mock.calls[1][0] as { url?: string; data?: unknown }
    expect(depCall?.url).toContain('/api/v1/user/42/days')
    expect((depCall?.data as { user_id?: number })?.user_id).toBe(42)
    // Both entries are gone and the idmap is cleaned up after a full flush.
    expect(fake.store('outbox').size).toBe(0)
    expect(fake.store('idmap').size).toBe(0)
  })

  it('reads the real id from the nested data.user shape of a user create', async () => {
    axiosCall.fn.mockResolvedValueOnce({ data: { data: { user: { id: 55 }, password: 'temp' } } })
    axiosCall.fn.mockResolvedValue(okResponse)

    seed({ id: 'c', ts: 100, method: 'POST', url: 'http://api.test/api/v1/user', body: { name: 'B' }, entity: 'user', tempId: -1800000000000 })
    seed({ id: 'd', ts: 200, method: 'PUT', url: 'http://api.test/api/v1/user/-1800000000000', body: { position: 'Инженер' }, entity: 'user' })

    const result = await flushOutbox()

    expect(result.ok).toBe(2)
    expect(axiosCall.fn.mock.calls[1][0]?.url).toContain('/api/v1/user/55')
  })

  it('sends an Idempotency-Key header on mutating methods (stable across retries)', async () => {
    seed({ id: 'upd', ts: 100, method: 'PUT', url: 'http://api.test/api/v1/resource/1', body: { title: 'X' }, entity: 'resource' })
    await flushOutbox()
    const config = axiosCall.fn.mock.calls[0][0] as { headers?: Record<string, string>; id?: string }
    expect(config?.headers?.['Idempotency-Key']).toBe('upd')
  })
})

describe('flushOutbox — idempotent drop of DELETE 404/410', () => {
  it.each([404, 410])('drops a DELETE answered %i and counts it as ok', async (status) => {
    axiosCall.fn.mockRejectedValueOnce(httpError(status))
    seed({ id: 'del', ts: 100, method: 'DELETE', url: 'http://api.test/api/v1/resource/99', entity: 'resource' })

    const result = await flushOutbox()

    expect(result.ok).toBe(1)
    expect(result.failed).toBe(0)
    expect(fake.store('outbox').size).toBe(0)
  })

  it('keeps a DELETE that the server rejected with a real error (500)', async () => {
    axiosCall.fn.mockRejectedValueOnce(httpError(500))
    seed({ id: 'del', ts: 100, method: 'DELETE', url: 'http://api.test/api/v1/resource/99', entity: 'resource' })

    const result = await flushOutbox()

    expect(result.ok).toBe(0)
    expect(result.failed).toBe(1)
    const kept = fake.store('outbox').get('del') as OutboxEntry
    expect(kept).toBeDefined()
    expect(kept.attempts).toBe(1)
    expect(kept.failed).toBeDefined()
  })
})

describe('flushOutbox — ordering and retry gates', () => {
  it('sends entries in ts (FIFO) order even when the store returns them unsorted', async () => {
    seed({ id: 'a', ts: 300, method: 'PUT', url: 'http://api.test/api/v1/resource/3', entity: 'resource' })
    seed({ id: 'b', ts: 100, method: 'PUT', url: 'http://api.test/api/v1/resource/1', entity: 'resource' })
    seed({ id: 'c', ts: 200, method: 'PUT', url: 'http://api.test/api/v1/resource/2', entity: 'resource' })

    const result = await flushOutbox()

    expect(result.ok).toBe(3)
    const urls = axiosCall.fn.mock.calls.map((c) => (c[0] as { url?: string })?.url)
    expect(urls).toEqual([
      'http://api.test/api/v1/resource/1',
      'http://api.test/api/v1/resource/2',
      'http://api.test/api/v1/resource/3',
    ])
  })

  it('skips quarantined entries and entries still in backoff without sending them', async () => {
    const axiosCalls = axiosCall.fn.mock.calls.length
    seed({ id: 'q', ts: 100, method: 'PUT', url: 'http://api.test/api/v1/resource/1', entity: 'resource', quarantined: true })
    seed({ id: 'bf', ts: 200, method: 'PUT', url: 'http://api.test/api/v1/resource/2', entity: 'resource', failed: { message: 'boom', at: Date.now() } })

    const result = await flushOutbox()

    expect(result.ok).toBe(0)
    expect(result.failed).toBe(0)
    expect(axiosCall.fn.mock.calls.length).toBe(axiosCalls)
    // Entries are preserved — retries are gated, the queue is never wiped.
    expect(fake.store('outbox').size).toBe(2)
  })
})

describe('clearOutbox', () => {
  it('removes every entry and the idmap rows', async () => {
    seed({ id: 'a', ts: 100, method: 'POST', url: 'http://api.test/api/v1/user', entity: 'user', tempId: -1700000000000 })
    await vi.mocked(idbPut)('idmap', '-1700000000000', { temp: -1700000000000, real: 42 })
    expect(await vi.mocked(idbAll)('outbox')).toHaveLength(1)

    await clearOutbox()

    expect(fake.store('outbox').size).toBe(0)
    expect(fake.store('idmap').size).toBe(0)
    void idbDel
  })
})