/**
 * Tests for the centralized hint registry (src/hints/registry.ts).
 */
import { describe, expect, it } from 'vitest'
import { hintPage, hintPages, registerHint, type HintPage } from './registry'

describe('hint registry', () => {
  it('has valid built-in pages', () => {
    const pages = hintPages()
    expect(pages.length).toBeGreaterThan(0)
    for (const p of pages) {
      expect(p.id).toBeTruthy()
      expect(p.title).toBeTruthy()
      expect(Array.isArray(p.blocks)).toBe(true)
      for (const b of p.blocks) {
        if (b.kind === 'p' || b.kind === 'code') expect(b.text.length).toBeGreaterThan(0)
        if (b.kind === 'ul' || b.kind === 'ol') expect(b.items.length).toBeGreaterThan(0)
      }
    }
  })

  it('looks pages up by id', () => {
    expect(hintPage('scope-expressions')?.title).toBe('Выражения области видимости')
    expect(hintPage('nope')).toBeNull()
  })

  it('ignores duplicate registrations', () => {
    const before = hintPages().length
    const dup: HintPage = { id: 'scope-expressions', title: 'dup', blocks: [] }
    registerHint(dup)
    expect(hintPages().length).toBe(before)
  })
})