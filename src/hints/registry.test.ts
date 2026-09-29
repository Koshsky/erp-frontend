/**
 * Tests for the centralized hint registry (src/hints/registry.ts) — asset
 * loading with the user-overrides-defaults rule.
 */
import { describe, expect, it } from 'vitest'
import {
  hintPage,
  hintPages,
  mergeHintPages,
  parseHintPage,
  registerHint,
  type HintPage,
} from './registry'

describe('hint registry', () => {
  it('loads valid built-in asset pages', () => {
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

describe('hint asset rules (apply to every asset)', () => {
  const def: HintPage = { id: 'a', title: 'default a', blocks: [{ kind: 'p', text: 'default' }] }
  const custom: HintPage = { id: 'a', title: 'custom a', blocks: [{ kind: 'p', text: 'custom' }] }
  const other: HintPage = { id: 'b', title: 'b', blocks: [{ kind: 'p', text: 'b' }] }

  it('the user asset wins over the default by id', () => {
    const merged = mergeHintPages([def, other], [custom])
    expect(merged.get('a')?.title).toBe('custom a')
    expect(merged.get('b')?.title).toBe('b')
    expect(merged.size).toBe(2)
  })

  it('an invalid asset is rejected (fallback stays safe)', () => {
    expect(parseHintPage(null)).toBeNull()
    expect(parseHintPage({ id: 'x', title: 't' })).toBeNull()
    expect(parseHintPage({ id: 'x', title: 't', blocks: [{ kind: 'p', items: [] }] })).toBeNull()
    expect(parseHintPage({ id: 'x', title: 't', blocks: [{ kind: 'p', text: 'ok' }] })?.id).toBe('x')
  })
})