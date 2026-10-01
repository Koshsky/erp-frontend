/**
 * The single entry point for ALL assets (src/assets): two catalogs mirror
 * each other per kind — `default/<kind>/` holds the built-in files,
 * `custom/<kind>/` the user overrides (empty by default). Lookup rule for
 * EVERY kind (hints, fonts, …): the custom asset wins when it exists,
 * otherwise the default one is used. Invalid custom files are ignored
 * (fall back to the default), so a broken override can never break a
 * feature. Import assets only through this module.
 *
 * The asset layer itself is kind-agnostic: it merges *raw* file contents
 * and cannot interpret them. Payload validation is injected per kind by
 * the consumer via the optional `isValid` argument of
 * `resolveAssets`/`resolveAsset` (and `mergeCatalogs`): a custom entry
 * replaces the default of the same file name only when it passes
 * validation — on failure the default entry is retained, which is the
 * documented fallback. Without a validator the raw custom entry wins
 * unconditionally. The hints registry (src/hints/registry.ts) is the
 * reference consumer: it passes a `parseHintMarkdown`-based validator, so a
 * broken custom hint falls back to the built-in page.
 *
 * Two custom-catalog sources coexist:
 * - hints: bundled at build time via the Vite glob (Markdown pages, `*.md`);
 * - icons: NOT bundled — the custom icons are mounted into the container
 *   at runtime (deploy mounts ./assets/custom into
 *   /usr/share/nginx/html/assets/custom, no rebuild). They are resolved
 *   asynchronously by `resolveAssetWithCustom`, which fetches the file,
 *   validates it as an inert inline SVG and falls back to the bundled
 *   default on any fetch/validation failure.
 *
 * Documentation files named `README*` inside asset catalogs are NOT assets:
 * they are excluded by both catalog getters so a hint doc (for example
 * custom/hints/README.md) can never be picked up as a hint page.
 */

export type AssetKind = 'hints' | 'icons'

export type AssetValidator = (raw: unknown) => boolean

// Vite asset globs keyed by file path (per kind, both catalogs). The icons
// catalog is intentionally DEFAULT-ONLY: custom icons are runtime-mounted
// (task 14) and must never enter the build.

const defaultGlobs: Record<string, Record<string, unknown>> = {
  hints: import.meta.glob('./default/hints/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, unknown>,
  icons: import.meta.glob('./default/icons/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, unknown>,
}
const customGlobs: Record<string, Record<string, unknown>> = {
  hints: import.meta.glob('./custom/hints/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, unknown>,
}

/** Catalog files starting with this name (case-insensitive) are docs, not assets. */
const DOC_FILE_PREFIX = 'README'

function isDocFile(name: string): boolean {
  return name.toUpperCase().startsWith(DOC_FILE_PREFIX)
}

function assetName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

/** Default catalog of a kind: «file name → raw content» (README* docs excluded). */
export function defaultAssets(kind: AssetKind): Map<string, unknown> {
  return new Map(
    Object.entries(defaultGlobs[kind] ?? {})
      .map(([path, raw]) => [assetName(path), raw] as const)
      .filter(([name]) => !isDocFile(name)),
  )
}

/** Custom catalog of a kind: «file name → raw content» (empty by default; README* docs excluded). */
export function customAssets(kind: AssetKind): Map<string, unknown> {
  return new Map(
    Object.entries(customGlobs[kind] ?? {})
      .map(([path, raw]) => [assetName(path), raw] as const)
      .filter(([name]) => !isDocFile(name)),
  )
}

/**
 * Merges two catalogs: a custom entry overrides the default of the same
 * file name — but only when it passes `isValid` (or when no validator is
 * given). An invalid custom entry is skipped, so the default entry is
 * retained (the fallback); an invalid custom file without a default
 * counterpart is absent from the result.
 */
export function mergeCatalogs(
  defaults: Map<string, unknown>,
  customs: Map<string, unknown>,
  isValid?: AssetValidator,
): Map<string, unknown> {
  const out = new Map(defaults)
  for (const [name, raw] of customs) {
    if (!isValid || isValid(raw)) out.set(name, raw)
  }
  return out
}

/**
 * All assets of a kind: «file name → raw content»; custom overrides the
 * default for the same file name when it passes `isValid` (applies to
 * every asset kind).
 */
export function resolveAssets(kind: AssetKind, isValid?: AssetValidator): Map<string, unknown> {
  return mergeCatalogs(defaultAssets(kind), customAssets(kind), isValid)
}

/** A single asset of a kind by file name (null — nowhere to be found). */
export function resolveAsset(kind: AssetKind, name: string, isValid?: AssetValidator): unknown | null {
  return resolveAssets(kind, isValid).get(name) ?? null
}

/**
 * Validates a raw string as an inert, well-formed inline SVG: exactly one
 * root `<svg>` element, no <script>, no inline `on…=` handlers and no
 * `javascript:` URLs. Used for fetched custom icons (and safely reusable
 * for any other SVG consumer).
 */
export function isValidSvg(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  if ((raw.match(/<svg[\s>]/g) ?? []).length !== 1) return false
  if (/<script/i.test(raw)) return false
  if (/on[a-z]+\s*=/i.test(raw)) return false
  if (/javascript:/i.test(raw)) return false
  return true
}

export interface ResolveAssetWithCustomOptions {
  /** Validator applied to the fetched payload. Defaults to `isValidSvg` for the 'icons' kind. */
  isValid?: AssetValidator
  /** Base URL override for the custom-asset prefix (tests / non-browser environments). */
  baseURL?: string
}

/**
 * Module-level memo of resolved runtime assets, keyed by `kind:name` — the
 * final outcome (the custom override, the bundled default, or null) so a
 * repeated lookup performs no second fetch.
 */
const runtimeCustomCache = new Map<string, unknown>()

/**
 * Runtime asset resolution with a custom override. First tries the mounted
 * custom dir at `{BASE_URL}assets/custom/<kind>/<name>` (icons are overlaid
 * onto the container without a rebuild); when the fetch fails (404/network)
 * or the payload fails validation, falls back to the bundled default via
 * `resolveAsset`; null when the asset exists nowhere.
 */
export async function resolveAssetWithCustom(
  kind: AssetKind,
  name: string,
  opts?: ResolveAssetWithCustomOptions,
): Promise<unknown | null> {
  const cacheKey = `${kind}:${name}`
  if (runtimeCustomCache.has(cacheKey)) {
    return runtimeCustomCache.get(cacheKey) as unknown | null
  }
  const isValid = opts?.isValid ?? (kind === 'icons' ? isValidSvg : undefined)
  const baseURL = opts?.baseURL ?? import.meta.env.BASE_URL
  let resolved: unknown | null = null
  try {
    const res = await fetch(`${baseURL}assets/custom/${kind}/${name}`)
    if (!res.ok) throw new Error(`custom asset unavailable (HTTP ${res.status})`)
    const raw = await res.text()
    if (isValid && !isValid(raw)) throw new Error('custom asset failed validation')
    resolved = raw
  } catch {
    // 404 / network error / invalid payload — fall back to the bundled default below.
  }
  if (resolved === null) resolved = resolveAsset(kind, name, isValid)
  runtimeCustomCache.set(cacheKey, resolved)
  return resolved
}