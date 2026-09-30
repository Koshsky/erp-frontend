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
 * reference consumer: it passes a `parseHintPage`-based validator, so a
 * broken custom hint falls back to the built-in page.
 */

export type AssetKind = 'hints'

export type AssetValidator = (raw: unknown) => boolean

// Vite asset globs keyed by file path (per kind, both catalogs).

const defaultGlobs: Record<string, Record<string, unknown>> = {
  hints: import.meta.glob('./default/hints/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
}
const customGlobs: Record<string, Record<string, unknown>> = {
  hints: import.meta.glob('./custom/hints/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
}


function assetName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

/** Default catalog of a kind: «file name → raw content». */
export function defaultAssets(kind: AssetKind): Map<string, unknown> {
  return new Map(Object.entries(defaultGlobs[kind] ?? {}).map(([path, raw]) => [assetName(path), raw]))
}

/** Custom catalog of a kind: «file name → raw content» (empty by default). */
export function customAssets(kind: AssetKind): Map<string, unknown> {
  return new Map(Object.entries(customGlobs[kind] ?? {}).map(([path, raw]) => [assetName(path), raw]))
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