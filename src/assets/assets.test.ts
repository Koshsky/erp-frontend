/**
 * Tests for the unified assets entry point (src/assets/index.ts): the
 * custom/Default catalogs mirror each other and the custom asset wins for
 * every kind — but only when it passes the caller's validation, so an
 * invalid override of a built-in file name falls back to the default.
 */
import { describe, expect, it } from 'vitest'
import { customAssets, defaultAssets, mergeCatalogs, resolveAsset, resolveAssets } from './index'

// Synthetic catalogs stand in for the Vite glob inputs: the real custom
// catalog is empty by construction (src/assets/custom/hints ships no JSON).
const defaults = new Map<string, unknown>([
  ['permissions-editor.json', { id: 'permissions-editor', title: 'built-in', blocks: [{ kind: 'p', text: 'default' }] }],
  ['planner.json', { id: 'planner', title: 'built-in planner', blocks: [] }],
])
const customs = new Map<string, unknown>([
  ['permissions-editor.json', { id: 'permissions-editor', title: 'custom', blocks: [{ kind: 'p', text: 'override' }] }],
])

describe('assets entry point', () => {
  it('loads the built-in hint assets by name', () => {
    const all = resolveAssets('hints')
    expect(all.size).toBeGreaterThan(0)
    expect(all.has('permissions-editor.json')).toBe(true)
    const page = resolveAsset('hints', 'permissions-editor.json')
    expect(typeof page).toBe('object')
    expect((page as { id?: string })?.id).toBe('permissions-editor')
  })

  it('resolves an unknown name to null', () => {
    expect(resolveAsset('hints', 'nope.json')).toBeNull()
  })

  it('exposes the real catalogs as filename-keyed maps', () => {
    const byName = (m: Map<string, unknown>) => [...m.keys()]
    expect(byName(defaultAssets('hints'))).toEqual(expect.arrayContaining(['planner.json', 'permissions-editor.json']))
    expect(customAssets('hints').size).toBe(0)
  })
})

describe('catalog merge: custom overrides default for the same file name', () => {
  const accepts = (raw: unknown): boolean => (raw as { title?: string })?.title === 'custom'

  it('a valid custom entry replaces the default of the same file name', () => {
    const merged = mergeCatalogs(defaults, customs, accepts)
    expect((merged.get('permissions-editor.json') as { title?: string })?.title).toBe('custom')
    expect(merged.get('planner.json')).toEqual(defaults.get('planner.json'))
    expect(merged.size).toBe(2)
  })

  it('an invalid custom entry falls back to the default of the same file name', () => {
    const merged = mergeCatalogs(defaults, customs, () => false)
    expect(merged.get('permissions-editor.json')).toEqual(defaults.get('permissions-editor.json'))
    expect(merged.size).toBe(2)
  })

  it('an invalid custom file without a default counterpart is dropped entirely', () => {
    const merged = mergeCatalogs(defaults, new Map([['private.json', { id: 'x' }]]), () => false)
    expect(merged.has('private.json')).toBe(false)
    expect(merged.size).toBe(2)
  })

  it('without a validator the custom entry wins unconditionally (backward compatible)', () => {
    const merged = mergeCatalogs(defaults, customs)
    expect((merged.get('permissions-editor.json') as { title?: string })?.title).toBe('custom')
  })

  it('resolveAsset forwards the validator to the merge (empty real custom catalog — default stays)', () => {
    const raw = resolveAsset('hints', 'permissions-editor.json', () => false)
    expect(raw).toEqual(defaultAssets('hints').get('permissions-editor.json'))
  })
})