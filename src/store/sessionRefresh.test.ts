import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { watch } from 'vue'

const fake = vi.hoisted(() => ({
  locked: vi.fn(), refresh: vi.fn(), login: vi.fn(), loggedOut: vi.fn(),
  listeners: new Set<(token: string) => void>(),
}))
vi.mock('@/sessionSync', () => ({
  withRefreshLock: fake.locked,
  publishSession: vi.fn(), subscribeSession: () => () => {},
  subscribeToken: (cb: (token: string) => void) => { fake.listeners.add(cb); return () => fake.listeners.delete(cb) },
}))
vi.mock('@/loggedOut', () => ({ isLoggedOut: fake.loggedOut, clearLoggedOut: vi.fn(() => fake.loggedOut.mockReturnValue(false)), setLoggedOut: vi.fn() }))
vi.mock('@/offline/session', () => ({ loadRefreshToken: async () => 'saved', saveRefreshToken: vi.fn(async () => {}), clearRefreshToken: vi.fn(async () => {}) }))
vi.mock('@/api', async original => ({
  ...await original<typeof import('@/api')>(),
  AuthApi: class { authRefreshPost(...args: unknown[]) { return fake.refresh(...args) } authLoginPost(...args: unknown[]) { return fake.login(...args) } },
}))
import { useAuthStore, usePlanningStore } from './index'
import { getAccessToken, setAccessToken } from '@/token'
import { isOffline } from '@/offline/state'
import { saveRefreshToken, clearRefreshToken } from '@/offline/session'

const jwt = (offset: number) => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + offset }))}.signature`

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  fake.listeners.clear()
  fake.loggedOut.mockReturnValue(false)
  fake.locked.mockResolvedValue(null)
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  vi.stubGlobal('window', {
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    setInterval: vi.fn(() => 1),
    setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  })
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  setActivePinia(createPinia())
  isOffline.value = false
  setAccessToken(jwt(-60))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setAccessToken(null) })

describe('waiting for a sibling session', () => {
  it('does not report success after two seconds with an expired token', async () => {
    const auth = useAuthStore()
    let settled = false
    const pending = auth.refreshSession().then(ok => { settled = true; return ok })
    await vi.advanceTimersByTimeAsync(2300)
    expect(settled).toBe(false)
    expect(fake.locked).toHaveBeenCalledTimes(2)
    for (const listener of fake.listeners) listener(jwt(3600))
    expect(await pending).toBe(true)
    expect(auth.accessExpired()).toBe(false)
  })

  it('ignores expired broadcasts while waiting for a usable session', async () => {
    const auth = useAuthStore()
    let settled = false
    const pending = auth.refreshSession().then(ok => { settled = true; return ok })
    await vi.advanceTimersByTimeAsync(1)
    for (const listener of fake.listeners) listener(jwt(-30))
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toBe(false)
    for (const listener of fake.listeners) listener(jwt(3600))
    expect(await pending).toBe(true)
  })

  it('retries ownership after the sibling disappears', async () => {
    fake.locked.mockResolvedValueOnce(null).mockImplementation(async run => run())
    fake.refresh.mockResolvedValue({ data: { data: { access_token: jwt(3600) } } })
    const auth = useAuthStore()
    const pending = auth.refreshSession()
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toBe(true)
    expect(fake.refresh).toHaveBeenCalledTimes(1)
    expect(auth.accessExpired()).toBe(false)
  })

  it('stops attempting renewal if connectivity is lost during the wait', async () => {
    const pending = useAuthStore().refreshSession()
    await vi.advanceTimersByTimeAsync(1)
    isOffline.value = true
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toBe(true)
    expect(fake.locked).toHaveBeenCalledTimes(1)
    expect(fake.refresh).not.toHaveBeenCalled()
  })

  it('does not restore a session logged out while another tab was refreshing', async () => {
    const pending = useAuthStore().refreshSession()
    await vi.advanceTimersByTimeAsync(1)
    fake.loggedOut.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toBe(false)
    expect(fake.refresh).not.toHaveBeenCalled()
  })
})


describe('cached identity after a cross-tab logout', () => {
  const saved = { id: 42, username: 'admin', preset: 'admin' }

  it('does not treat a cached profile as an online session when logout is recorded', () => {
    fake.loggedOut.mockReturnValue(true)
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(saved) })
    const auth = useAuthStore()
    expect(auth.user?.id).toBe(42)
    expect(auth.isAuthenticated).toBe(false)
  })

  it('invalidates stale in-memory authentication without revoking or deleting the shared session', async () => {
    const auth = useAuthStore()
    auth.user = saved
    auth.isAuthenticated = true
    usePlanningStore().taskPlanning = { processes: [{ id: 1 }] }
    setAccessToken(jwt(3600))
    fake.loggedOut.mockReturnValue(true)

    expect(await auth.refreshSession()).toBe(false)

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toEqual(saved)
    expect(usePlanningStore().taskPlanning).toBeNull()
    expect(getAccessToken()).toBe('')
    expect(fake.refresh).not.toHaveBeenCalled()
    expect(fake.locked).not.toHaveBeenCalled()
    expect(clearRefreshToken).not.toHaveBeenCalled()
  })

  it('keeps an explicitly entered offline session while the backend is unreachable', async () => {
    fake.loggedOut.mockReturnValue(true)
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(saved) })
    isOffline.value = true
    const auth = useAuthStore()
    expect(auth.enterOffline('admin')).toBe(true)
    expect(await auth.refreshSession()).toBe(true)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.sessionMode).toBe('offline')
    expect(fake.refresh).not.toHaveBeenCalled()
  })
})


it('discards a refresh response that arrives after logout was recorded', async () => {
  let reply!: (value: unknown) => void
  fake.locked.mockImplementation(async run => run())
  fake.refresh.mockImplementation(() => new Promise(resolve => { reply = resolve }))
  const auth = useAuthStore()
  auth.user = { id: 42, username: 'admin', preset: 'admin' }
  auth.isAuthenticated = true
  const pending = auth.refreshSession()
  await vi.advanceTimersByTimeAsync(1)
  fake.loggedOut.mockReturnValue(true)
  reply({ data: { data: { access_token: jwt(3600), user: auth.user } } })
  expect(await pending).toBe(false)
  expect(auth.isAuthenticated).toBe(false)
  expect(getAccessToken()).toBe('')
})


it('persists refresh state and clears logout before publishing a successful manual login', async () => {
  fake.loggedOut.mockReturnValue(true)
  const user = { id: 42, username: 'admin', preset: 'admin' }
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(user), setItem: vi.fn() })
  fake.login.mockResolvedValue({ data: { data: { access_token: jwt(3600), refresh_token: 'test-refresh', user } } })
  let persisted!: () => void
  vi.mocked(saveRefreshToken).mockImplementationOnce(() => new Promise(resolve => { persisted = resolve }))
  const auth = useAuthStore()
  const logoutWhenAuthenticated: boolean[] = []
  const stop = watch(() => auth.isAuthenticated, value => { if (value) logoutWhenAuthenticated.push(fake.loggedOut()) }, { flush: 'sync' })
  const login = auth.login('admin', 'test-password')
  await vi.advanceTimersByTimeAsync(1)
  expect(auth.isAuthenticated).toBe(false)
  expect(fake.loggedOut()).toBe(true)
  persisted()
  expect(await login).toBe(true)
  expect(auth.isAuthenticated).toBe(true)
  expect(logoutWhenAuthenticated).toEqual([false])
  stop()
})
