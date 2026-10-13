import { describe, expect, it } from 'vitest'
import {
  NO_ACCESS,
  cellKey,
  cellScope,
  gridActions,
  gridResources,
  gridSections,
  scopeByCell,
} from './rbacGrid'

/** A payload shaped like GET /rbac/matrix: complete, "none" for no right. */
const cells = [
  { preset: 'dp', resource: 'project', action: 'view', scope: 'all' },
  { preset: 'dp', resource: 'project', action: 'create', scope: 'none' },
  { preset: 'dp', resource: 'audit', action: 'view', scope: 'none' },
  { preset: 'dp', resource: 'brand_new', action: 'view', scope: 'none' },
]

const GROUPS = [
  { key: 'planning', resources: ['project', 'process'] },
  { key: 'advanced', resources: ['audit'] },
]

describe('rbacGrid', () => {
  it('normalizes a missing or empty scope to "no access"', () => {
    expect(cellScope(cells, 'dp', 'project', 'view')).toBe('all')
    expect(cellScope(cells, 'dp', 'project', 'create')).toBe(NO_ACCESS)
    // A cell absent from the payload is a denial, not an empty string.
    expect(cellScope(cells, 'dp', 'task', 'view')).toBe(NO_ACCESS)
    expect(cellScope([{ preset: 'dp', resource: 'task', action: 'view', scope: '' }], 'dp', 'task', 'view')).toBe(
      NO_ACCESS,
    )
    expect(scopeByCell(cells)[cellKey('dp', 'audit', 'view')]).toBe(NO_ACCESS)
  })

  it('derives resources and actions from the payload', () => {
    expect(gridResources(cells)).toEqual(['project', 'audit', 'brand_new'])
    expect(gridActions(cells, ['view', 'create', 'update', 'delete'])).toEqual(['view', 'create'])
    expect(gridActions(cells)).toEqual(['view', 'create'])
  })

  it('keeps known sections in order and appends a fallback for the rest', () => {
    const sections = gridSections(cells, GROUPS)
    expect(sections).toEqual([
      { key: 'planning', resources: ['project'] },
      { key: 'advanced', resources: ['audit'] },
      // A resource the frontend does not know must still be rendered.
      { key: 'other', resources: ['brand_new'] },
    ])
  })

  it('drops empty sections and needs no fallback when everything is known', () => {
    const sections = gridSections(
      [{ preset: 'dp', resource: 'project', action: 'view', scope: 'all' }],
      GROUPS,
    )
    expect(sections).toEqual([{ key: 'planning', resources: ['project'] }])
  })
})
