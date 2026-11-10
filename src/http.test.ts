import axios, { AxiosError, type AxiosResponse } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginMutation } from './offline/mutationGuard'

const mocks = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), byPath: vi.fn(), replay: vi.fn(), scheduledReplay: vi.fn(), offline: { value: false } }))
vi.mock('./router', () => ({ default: { currentRoute: { value: { name: 'planner' } }, push: vi.fn() } }))
vi.mock('./offline/cache', () => ({ cachePut: mocks.put, cacheGet: mocks.get, cacheGetByPath: mocks.byPath, userCachePrefix: () => 'u51:' }))
vi.mock('./offline/outbox', () => ({ replayOutboxToCache: mocks.replay, scheduleReplayOutboxToCache: mocks.scheduledReplay, createMutationKey: () => crypto.randomUUID() }))
vi.mock('./offline/state', () => ({ isOffline: mocks.offline }))
vi.mock('./offline/sync', () => ({ ensureAutoSession: vi.fn() }))
vi.mock('./token', () => ({ getAccessToken: () => 'test-token' }))
import { setupHttp } from './http'

const adapter = axios.defaults.adapter
beforeEach(() => {
  vi.clearAllMocks()
  mocks.offline.value = false
  mocks.get.mockResolvedValue(null)
  mocks.byPath.mockResolvedValue(null)
  axios.interceptors.request.clear()
  axios.interceptors.response.clear()
  setupHttp()
})
afterEach(() => {
  axios.defaults.adapter = adapter
  axios.interceptors.request.clear()
  axios.interceptors.response.clear()
})
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('offline cache and in-flight read safety', () => {
  it('stores a clean successful read under the current user cache key', async () => {
    const body = { data: { processes: [] } }
    axios.defaults.adapter = async (config) => ({ status: 200, statusText: 'OK', headers: {}, config, data: body })
    await axios.get('/api/v1/planning/tasks')
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith('u51:/api/v1/planning/tasks', body)
    expect(mocks.scheduledReplay).toHaveBeenCalledTimes(1)
  })
  it.each(['before', 'during'])('does not cache a GET started %s an unconfirmed mutation', async (when) => {
    let finish = when === 'during' ? beginMutation() : () => {}
    let reply!: () => void
    axios.defaults.adapter = (config) => new Promise<AxiosResponse>((resolve) => {
      reply = () => resolve({ status: 200, statusText: 'OK', headers: {}, config, data: { data: 'old' } })
    })
    try {
      const read = axios.get('/api/v1/planning/tasks')
      await tick()
      if (when === 'before') finish = beginMutation()
      finish()
      reply()
      await read
      expect(mocks.put).not.toHaveBeenCalled()
    } finally { finish() }
  })
  it('serves the preserved cache during a network failure, then refreshes it on recovery', async () => {
    const cached = { data: { processes: [{ id: 1 }] } }
    mocks.get.mockResolvedValue(cached)
    axios.defaults.adapter = async (config) => { throw new AxiosError('Network Error', 'ERR_NETWORK', config) }
    const response = await axios.get('/api/v1/planning/tasks')
    expect(response.data).toEqual(cached)
    expect(mocks.offline.value).toBe(true)
    expect(mocks.replay).toHaveBeenCalledTimes(1)
    expect(mocks.put).not.toHaveBeenCalled()
    mocks.offline.value = false
    const fresh = { data: { processes: [{ id: 2 }] } }
    axios.defaults.adapter = async (config) => ({ status: 200, statusText: 'OK', headers: {}, config, data: fresh })
    await axios.get('/api/v1/planning/tasks')
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith('u51:/api/v1/planning/tasks', fresh)
  })
})

it('assigns an idempotency key before the first mutation and preserves it on retry', async () => {
  const keys: unknown[] = []
  axios.defaults.adapter = async (config) => {
    keys.push(config.headers.get('Idempotency-Key'))
    return { status: 200, statusText: 'OK', headers: {}, config, data: {} }
  }
  await axios.post('/api/v1/task', { title: 'Offline P0' })
  expect(keys[0]).toBeTruthy()
  await axios.post('/api/v1/task', { title: 'Offline P0' }, { headers: { 'Idempotency-Key': keys[0] as string } })
  expect(keys[1]).toBe(keys[0])
})

it('never stores a subject preview in the normal offline cache', async () => {
  axios.defaults.adapter = async (config) => ({ status: 200, statusText: 'OK', headers: {}, config, data: { data: 'subject only' } })
  await axios.get('/api/v1/planning/tasks', { headers: { 'X-View-User-ID': '7' } })
  expect(mocks.put).not.toHaveBeenCalled()
})
it('never serves an administrator cache as a subject preview on a network failure', async () => {
  mocks.get.mockResolvedValue({ data: 'whole system' })
  axios.defaults.adapter = async (config) => { throw new AxiosError('Network Error', 'ERR_NETWORK', config) }
  await expect(axios.get('/api/v1/planning/tasks', { headers: { 'X-View-User-ID': '7' } })).rejects.toThrow()
  expect(mocks.get).not.toHaveBeenCalled()
})
