/**
 * Centralized hint-content registry: every "?" explanation lives in the hint
 * ASSETS (src/hints/assets): `default/` — the built-in pages, `user/` — the
 * optional user overrides. Lookup rule for EVERY asset: the user asset wins
 * when it exists, otherwise the default one is used. Invalid user assets are
 * ignored (fall back to the default), so a broken override can never break
 * the panel.
 */

export type HintBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'code'; text: string }

export interface HintPage {
  id: string
  title: string
  blocks: HintBlock[]
}

// Vite asset globs: keyed by file path, values are the JSON payloads.
const defaultModules = import.meta.glob('./assets/default/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>
const customModules = import.meta.glob('./assets/custom/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

/** Validates a raw JSON value as a HintPage (null — invalid). */
export function parseHintPage(raw: unknown): HintPage | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as { id?: unknown; title?: unknown; blocks?: unknown }
  if (typeof p.id !== 'string' || p.id === '' || typeof p.title !== 'string' || p.title === '') return null
  if (!Array.isArray(p.blocks)) return null
  const blocks: HintBlock[] = []
  for (const b of p.blocks) {
    const block = b as { kind?: unknown; text?: unknown; items?: unknown }
    if (block.kind === 'p' || block.kind === 'code') {
      if (typeof block.text !== 'string') return null
      blocks.push({ kind: block.kind, text: block.text })
    } else if (block.kind === 'ul' || block.kind === 'ol') {
      if (!Array.isArray(block.items) || !block.items.every((i) => typeof i === 'string')) return null
      blocks.push({ kind: block.kind, items: block.items as string[] })
    } else {
      return null
    }
  }
  return { id: p.id, title: p.title, blocks }
}

/** Merges asset sets: custom pages override the defaults by id (every asset). */
export function mergeHintPages(defaults: HintPage[], custom: HintPage[]): Map<string, HintPage> {
  const out = new Map<string, HintPage>(defaults.map((p) => [p.id, p]))
  for (const p of custom) out.set(p.id, p)
  return out
}

function loadAssets(): Map<string, HintPage> {
  const defaults: HintPage[] = []
  for (const raw of Object.values(defaultModules)) {
    const page = parseHintPage(raw)
    if (page) defaults.push(page)
  }
  const custom: HintPage[] = []
  for (const raw of Object.values(customModules)) {
    const page = parseHintPage(raw)
    if (page) custom.push(page)
  }
  return mergeHintPages(defaults, custom)
}

const pages = loadAssets()

/** Returns a hint page by id (null — unknown). */
export function hintPage(id: string): HintPage | null {
  return pages.get(id) ?? null
}

/** All registered pages (for the stories/debug). */
export function hintPages(): HintPage[] {
  return [...pages.values()]
}

/** Registers an additional code-defined page (a duplicate id is ignored). */
export function registerHint(page: HintPage): void {
  if (!page.id || pages.has(page.id)) return
  pages.set(page.id, page)
}