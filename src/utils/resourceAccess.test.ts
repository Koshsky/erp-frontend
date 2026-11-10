import { describe, expect, it } from 'vitest'
import { resourcePageAccessible, resourceHeaderRows } from './resourceAccess'
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
