/**
 * Tests for the centralized hint registry (src/hints/registry.ts) — asset
 * loading with the user-overrides-defaults rule. Hints are Markdown files:
 * the id comes from the file name, the title from the first `# ` heading, and
 * the body is the remaining Markdown.
 */
import { describe, expect, it } from 'vitest'
import {
  hintPage,
  hintPages,
  mergeHintPages,
  parseHintMarkdown,
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
      expect(typeof p.body).toBe('string')
      expect(p.body.length).toBeGreaterThan(0)
    }
  })

  it('maps file names to ids and headings to titles', () => {
    expect(hintPage('scope-expressions')?.title).toBe('Выражения области видимости')
    expect(hintPage('planner')?.title).toBe('Планировщик')
    expect(hintPage('nope')).toBeNull()
  })

  it('ignores duplicate registrations', () => {
    const before = hintPages().length
    const dup: HintPage = { id: 'scope-expressions', title: 'dup', body: 'дубль' }
    registerHint(dup)
    expect(hintPages().length).toBe(before)
  })
})

describe('hint asset rules (apply to every asset)', () => {
  const def: HintPage = { id: 'a', title: 'default a', body: 'дефолтный текст' }
  const custom: HintPage = { id: 'a', title: 'custom a', body: 'пользовательский текст' }
  const other: HintPage = { id: 'b', title: 'b', body: 'ещё текст' }

  it('the user asset wins over the default by id', () => {
    const merged = mergeHintPages([def, other], [custom])
    expect(merged.get('a')?.title).toBe('custom a')
    expect(merged.get('b')?.title).toBe('b')
    expect(merged.size).toBe(2)
  })
})

describe('parseHintMarkdown', () => {
  it('splits the first # heading into the title and the rest into the body', () => {
    const parsed = parseHintMarkdown('# Планировщик\n\nТекст абзаца.\n\n- пункт')
    expect(parsed).toEqual({ title: 'Планировщик', body: 'Текст абзаца.\n\n- пункт' })
  })

  it('title falls back to empty (caller uses the id) when there is no heading', () => {
    const parsed = parseHintMarkdown('Просто текст без заголовка.')
    expect(parsed?.title).toBe('')
    expect(parsed?.body).toBe('Просто текст без заголовка.')
  })

  it('rejects non-strings and empty strings', () => {
    expect(parseHintMarkdown(null)).toBeNull()
    expect(parseHintMarkdown(undefined)).toBeNull()
    expect(parseHintMarkdown(42)).toBeNull()
    expect(parseHintMarkdown({})).toBeNull()
    expect(parseHintMarkdown('')).toBeNull()
    expect(parseHintMarkdown('   \n ')).toBeNull()
  })
})