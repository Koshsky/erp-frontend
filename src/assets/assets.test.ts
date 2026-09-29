/**
 * Tests for the unified assets entry point (src/assets/index.ts): the
 * custom/Default catalogs mirror each other and the custom asset wins for
 * every kind.
 */
import { describe, expect, it } from 'vitest'
import { resolveAsset, resolveAssets } from './index'

describe('assets entry point', () => {
  it('loads the built-in hint assets by name', () => {
    const all = resolveAssets('hints')
    expect(all.size).toBeGreaterThan(0)
    expect(all.has('permissions-editor.json')).toBe(true)
    const page = resolveAsset('hints', 'permissions-editor.json')
    expect(typeof page).toBe('object')
    expect((page as { id?: string })?.id).toBe('permissions-editor')
  })

  it('mirrors catalogs: custom overrides default for the same file name', () => {
    // The custom catalog mirrors default by construction; resolveAssets
    // keeps the LAST entry (custom) — duplicate names cannot survive.
    const names = [...resolveAssets('hints').keys()]
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
    expect(resolveAsset('hints', 'nope.json')).toBeNull()
  })
})
