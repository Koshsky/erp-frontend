/**
 * Tests for the unified assets entry point (src/assets/index.ts): the
 * custom/Default catalogs mirror each other and the custom asset wins for
 * every kind — but only when it passes the caller's validation, so an
 * invalid override of a built-in file name falls back to the default.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  customAssets,
  defaultAssets,
  isValidSvg,
  mergeCatalogs,
  resolveAsset,
  resolveAssetWithCustom,
  resolveAssets,
} from './index'

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

// ---------------------------------------------------------------------------
// Icons catalog (task 13/14): 14 bundled Lucide defaults, no build-time custom
// catalog (custom icons are mounted at runtime), and the async resolver that
// prefers a valid fetched custom icon over the bundled default.
// ---------------------------------------------------------------------------

/** The exact set of bundled default nav icons (file names under default/icons). */
const EXPECTED_ICONS = [
  'chart-gantt.svg',
  'chart-bar-big.svg',
  'chart-bar-stacked.svg',
  'calendar.svg',
  'user-group.svg',
  'hammer.svg',
  'users-round.svg',
  'network.svg',
  'wand-sparkles.svg',
  'tags.svg',
  'file-key.svg',
  'notebook-text.svg',
  'list.svg',
  'settings.svg',
]

/** Minimal inert inline SVG (what the runtime resolver would fetch). */
function svgPayload(marker: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/><!--${marker}--></svg>`
}

/** Stubs the global fetch with a canned response per URL. */
function stubFetch(impl: (url: string) => { ok: boolean; status?: number; text: () => Promise<string> }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      status: 200,
      ...impl(url),
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('icons catalog', () => {
  it('bundles exactly the 14 default nav icons', () => {
    const names = [...defaultAssets('icons').keys()]
    expect(names).toHaveLength(14)
    for (const name of EXPECTED_ICONS) expect(names).toContain(name)
  })

  it('has no build-time custom catalog (custom icons are runtime-mounted)', () => {
    expect(customAssets('icons').size).toBe(0)
    expect(resolveAssets('icons').size).toBe(14)
  })

  it('resolves a bundled icon as raw inert SVG markup', () => {
    const raw = resolveAsset('icons', 'chart-gantt.svg')
    expect(typeof raw).toBe('string')
    expect((raw as string).includes('<svg')).toBe(true)
  })

  it('rejects non-SVG and active content via isValidSvg', () => {
    expect(isValidSvg('<svg></svg>')).toBe(true)
    expect(isValidSvg(svgPayload('ok'))).toBe(true)
    expect(isValidSvg('<svg><script>alert(1)</script></svg>')).toBe(false)
    expect(isValidSvg('<svg onload="x()"></svg>')).toBe(false)
    expect(isValidSvg('<svg><a href="javascript:alert(1)">x</a></svg>')).toBe(false)
    expect(isValidSvg('not svg at all')).toBe(false)
    expect(isValidSvg('<svg><svg></svg></svg>')).toBe(false)
  })
})

describe('resolveAssetWithCustom (stubbed fetch, no network)', () => {
  it('a valid custom icon wins over the bundled default', async () => {
    stubFetch(() => ({ ok: true, text: () => Promise.resolve(svgPayload('CUSTOM')) }))
    const raw = await resolveAssetWithCustom('icons', 'chart-gantt.svg')
    expect(typeof raw).toBe('string')
    expect((raw as string).includes('CUSTOM')).toBe(true)
  })

  it('an invalid custom icon falls back to the bundled default', async () => {
    stubFetch(() => ({ ok: true, text: () => Promise.resolve('<svg><script>alert(1)</script></svg>') }))
    const raw = (await resolveAssetWithCustom('icons', 'calendar.svg')) as string
    expect(raw.includes('<svg')).toBe(true)
    expect(raw.includes('<script')).toBe(false)
  })

  it('a 404 falls back to the bundled default', async () => {
    stubFetch(() => ({ ok: false, status: 404, text: () => Promise.resolve('') }))
    const raw = await resolveAssetWithCustom('icons', 'settings.svg')
    expect(raw).toEqual(defaultAssets('icons').get('settings.svg'))
  })

  it('a 404 for an unknown name resolves to null', async () => {
    stubFetch(() => ({ ok: false, status: 404, text: () => Promise.resolve('') }))
    expect(await resolveAssetWithCustom('icons', 'nope.svg')).toBeNull()
  })
})