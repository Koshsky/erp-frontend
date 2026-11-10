import { describe, expect, it } from 'vitest'
import { resourcePageAccessible, resourceHeaderRows, resourceHeaderOwners } from './resourceAccess'
describe('resource page and header access', () => {
  it.each(['view', 'create', 'update', 'delete'])('shows navigation for %s alone', (allowed) => {
    expect(resourcePageAccessible((resource, action) => resource === 'resource' && action === allowed)).toBe(true)
  })
  it('hides the page only when all four actions are denied', () => {
    expect(resourcePageAccessible(() => false)).toBe(false)
  })
  it('shows exactly the selected owner resources, including zero assignments', () => {
    const own = { owner_id: 7, id: 1 }
    expect(resourceHeaderRows<{ owner_id?: number; id: number }>([own, { owner_id: 8, id: 2 }, { id: 3 }], 7)).toEqual([own])
    expect(resourceHeaderRows([own], null)).toEqual([])
  })
})


describe('resource-header owner options', () => {
  it('offers each resource owner once, preserving user catalogue order', () => {
    expect(resourceHeaderOwners([{ id: 7 }, { id: 8 }, { id: 9 }], [{ owner_id: 8 }, { owner_id: 8 }, { owner_id: 7 }])).toEqual([{ id: 7 }, { id: 8 }])
  })
  it('offers no users when no resources exist', () => {
    expect(resourceHeaderOwners([{ id: 7 }], [])).toEqual([])
  })
  it('does not treat missing owner or user IDs as ownership', () => {
    expect(resourceHeaderOwners([{}, { id: 7 }], [{}])).toEqual([])
  })
  it('reflects resource ownership transfers without changing the user catalogue', () => {
    const users = [{ id: 7 }, { id: 8 }]
    expect(resourceHeaderOwners(users, [{ owner_id: 7 }])).toEqual([{ id: 7 }])
    expect(resourceHeaderOwners(users, [{ owner_id: 8 }])).toEqual([{ id: 8 }])
    expect(users).toEqual([{ id: 7 }, { id: 8 }])
  })
})
