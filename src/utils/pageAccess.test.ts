import { describe, expect, it } from 'vitest'
import { PAGE_PERMISSIONS, pageAllowed } from './pageAccess'

describe('page access follows server action grants', () => {
  it.each(Object.entries(PAGE_PERMISSIONS))('%s denies missing rights and accepts only its required action', (page, [resource, action]) => {
    expect(pageAllowed(page, () => false)).toBe(false)
    expect(pageAllowed(page, (r, a) => r === resource && a === action)).toBe(true)
    expect(pageAllowed(page, (r) => r === 'unrelated')).toBe(false)
  })
  it.each(['create', 'update', 'delete'])('resource %s alone opens the resource page', (action) => {
    expect(pageAllowed('resources', (r, a) => r === 'resource' && a === action)).toBe(true)
  })
  it.each(['user-new', 'user-edit', 'user-access'])('%s is not unlocked by user listing', (page) => {
    expect(pageAllowed(page, (r, a) => r === 'user_admin' && a === 'view')).toBe(false)
  })
  it.each(['profile', 'system-settings', 'system-queue'])('%s remains available without business permissions', (page) => {
    expect(pageAllowed(page, () => false)).toBe(true)
  })
})
