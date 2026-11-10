import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const fake = vi.hoisted(() => ({
  locked: vi.fn(), refresh: vi.fn(), loggedOut: vi.fn(),
  listeners: new Set<(token: string) => void>(),
}))
vi.mock('@/sessionSync', () => ({
  withRefreshLock: fake.locked,
  publishSession: vi.fn(), subscribeSession: () => () => {},
  subscribeToken: (cb: (token: string) => void) => { fake.listeners.add(cb); return () => fake.listeners.delete(cb) },
}))
vi.mock('@/loggedOut', () => ({ isLoggedOut: fake.loggedOut, clearLoggedOut: vi.fn(), setLoggedOut: vi.fn() }))
vi.mock('@/offline/session', () => ({ loadRefreshToken: async () => 'saved', saveRefreshToken: vi.fn(async () => {}), clearRefreshToken: vi.fn(async () => {}) }))
vi.mock('@/api', async original => ({
  ...await original<typeof import('@/api')>(),
  AuthApi: class { authRefreshPost(...args: unknown[]) { return fake.refresh(...args) } },
}))
import { useAuthStore } from './index'
import { setAccessToken } from '@/token'
import { isOffline } from '@/offline/state'

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
