import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { DtoResourceResponse } from '@/api'
import { isOffline } from '@/offline/state'
const calls = vi.hoisted(() => ({ get: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('@/api', () => ({ TimesheetResourcesApi: class { resourcesGet(...args: unknown[]) { return calls.get(...args) } } }))
vi.mock('@/offline/outbox', async () => { const { ref } = await import('vue'); return { pendingRefs: ref(new Set()) } })
vi.mock('@/store', () => ({ apiConfig: () => ({}) }))
vi.mock('@/offline/cache', () => ({ cacheGet: calls.read, cachePut: calls.write, userCachePrefix: () => 'u7:' }))
import { useOwnedResources } from './useOwnedResources'
let scope: ReturnType<typeof effectScope>
beforeEach(() => { vi.clearAllMocks(); calls.read.mockResolvedValue(null); isOffline.value = false; scope = effectScope() })
afterEach(() => { scope.stop(); isOffline.value = false })
describe('complete owner-only resource header', () => {
  it('loads 501 owned resources across pages independently of the table and excludes foreign rows', async () => {
    const first = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, owner_id: 7 }))
    calls.get.mockResolvedValueOnce({ data: { data: { items: first } } }).mockResolvedValueOnce({ data: { data: { items: [{ id: 501, owner_id: 7 }, { id: 502, owner_id: 8 }] } } })
    const result = scope.run(() => useOwnedResources(ref<DtoResourceResponse[]>([{ id: 1, owner_id: 7 }]), ref(7), ref(true)))!
    await vi.waitFor(() => expect(result.value).toHaveLength(501))
    expect(calls.get.mock.calls.map((args) => args.slice(0, 3))).toEqual([[500, 7, 0], [500, 7, 500]])
    expect(result.value.every((r) => r.owner_id === 7)).toBe(true)
    expect(calls.write).toHaveBeenCalledTimes(1)
  })
  it('restores the complete cached owner snapshot offline without API reads', async () => {
    isOffline.value = true
    calls.read.mockResolvedValue([{ id: 1, owner_id: 7 }, { id: 2, owner_id: 7 }])
    const result = scope.run(() => useOwnedResources(ref<DtoResourceResponse[]>([]), ref(7), ref(true)))!
    await vi.waitFor(() => expect(result.value).toHaveLength(2))
    expect(calls.get).not.toHaveBeenCalled()
  })
  it('never loads an own header in administrator system mode', async () => {
    scope.run(() => useOwnedResources(ref<DtoResourceResponse[]>([]), ref(7), ref(false)))
    await Promise.resolve()
    expect(calls.get).not.toHaveBeenCalled()
    expect(calls.read).not.toHaveBeenCalled()
  })
})
