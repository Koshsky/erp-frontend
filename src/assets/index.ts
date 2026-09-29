/**
 * The single entry point for ALL assets (src/assets): two catalogs mirror
 * each other per kind — `default/<kind>/` holds the built-in files,
 * `custom/<kind>/` the user overrides (empty by default). Lookup rule for
 * EVERY kind (hints, fonts, …): the custom asset wins when it exists,
 * otherwise the default one is used. Invalid custom files are ignored
 * (fall back to the default), so a broken override can never break a
 * feature. Import assets only through this module.
 */

export type AssetKind = 'hints'

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

/**
 * All assets of a kind: «file name → raw content»; custom overrides the
 * default for the same file name (applies to every asset kind).
 */
export function resolveAssets(kind: AssetKind): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const [path, raw] of Object.entries(defaultGlobs[kind] ?? {})) {
    out.set(assetName(path), raw)
  }
  for (const [path, raw] of Object.entries(customGlobs[kind] ?? {})) {
    out.set(assetName(path), raw)
  }
  return out
}

/** A single asset of a kind by file name (null — nowhere to be found). */
export function resolveAsset(kind: AssetKind, name: string): unknown | null {
  return resolveAssets(kind).get(name) ?? null
}