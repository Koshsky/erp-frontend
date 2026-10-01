/**
 * Centralized hint-content registry: every "?" explanation lives in the hint
 * ASSETS as a Markdown file (src/assets/default/hints + src/assets/custom/hints
 * — a single assets entry point with mirroring catalogs). Lookup rule
 * (applies to every asset kind): the custom asset wins when it exists,
 * otherwise the default one is used. Invalid custom assets are ignored (fall
 * back to the default), so a broken override can never break the panel.
 *
 * Mapping: the hint id is the file name without the `.md` extension (so
 * `planner.md` → id `planner`); the title is the first `# ` heading of the
 * document (falling back to the id); the body is the remaining Markdown and
 * is rendered by the MarkdownView component (see
 * src/components/common/MarkdownView).
 */
import { resolveAssets } from '@/assets'

export interface HintPage {
  id: string
  title: string
  /** Markdown body (everything after the title heading). */
  body: string
}

/**
 * Validates a raw value as Markdown hint content and extracts «title, body»
 * (null — invalid). The title is the first `# ` heading (empty when the
 * document has none); the body is the rest of the document.
 */
export function parseHintMarkdown(raw: unknown): { title: string; body: string } | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (text === '') return null
  // First `# ` heading (line start): split the title from the body.
  const heading = /^#\s+(.+)$/m.exec(text)
  if (heading) {
    return { title: heading[1].trim(), body: text.slice(heading.index + heading[0].length).trim() }
  }
  // No heading — the whole document is the body; the caller falls back to the id.
  return { title: '', body: text }
}

/** Merges asset sets: custom pages override the defaults by id (every asset). */
export function mergeHintPages(defaults: HintPage[], custom: HintPage[]): Map<string, HintPage> {
  const out = new Map<string, HintPage>(defaults.map((p) => [p.id, p]))
  for (const p of custom) out.set(p.id, p)
  return out
}

/** Hint id from an asset file name (`planner.md` → `planner`). */
function hintIdFromName(assetName: string): string {
  return assetName.replace(/\.md$/i, '')
}

function loadAssets(): Map<string, HintPage> {
  // resolveAssets('hints') keeps the custom-first rule per file name, but a
  // custom entry is merged only when it passes the validator: an invalid
  // override of a built-in file name falls back to the built-in page instead
  // of dropping the entry (the documented asset rule for every kind).
  const pages: HintPage[] = []
  for (const [name, raw] of resolveAssets('hints', (r) => parseHintMarkdown(r) !== null)) {
    const parsed = parseHintMarkdown(raw)
    if (!parsed) continue
    const id = hintIdFromName(name)
    pages.push({
      id,
      title: parsed.title === '' ? id : parsed.title,
      body: parsed.body,
    })
  }
  return new Map(pages.map((p) => [p.id, p]))
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