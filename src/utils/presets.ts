/**
 * Preset display helpers: a preset has a tag (system access code, e.g.
 * `worker`), a human-readable name and a description. Where only the tag is
 * known (users reference presets by tag), the display name comes from the
 * catalog or falls back to the Russian label of a known built-in tag, then to
 * the tag itself (cold start without the catalog, historic rows).
 */

/** Russian labels of the seeded built-in presets (fallback only). */
export const FALLBACK_PRESET_NAMES: Record<string, string> = {
  admin: 'Администратор',
  dp: 'Директор проектов',
  rp: 'Руководитель проекта',
  vp: 'Владелец процесса',
  worker: 'Работник',
}

export interface PresetLike {
  tag?: string | null
  name?: string | null
  description?: string | null
}

/** Display name of a catalog entry: the name, else the fallback, else the tag. */
export function presetDisplayName(p: PresetLike): string {
  const name = p.name?.trim()
  if (name) return name
  if (p.tag) return FALLBACK_PRESET_NAMES[p.tag] ?? p.tag
  return '—'
}

/**
 * Display name of a preset referenced by its tag: looked up in the catalog
 * (name wins), falling back to the built-in label, then to the tag itself.
 */
export function presetLabelFromCatalog(tag: string | null | undefined, catalog: PresetLike[]): string {
  if (!tag) return '—'
  const entry = catalog.find((p) => p.tag === tag)
  if (entry) return presetDisplayName(entry)
  return FALLBACK_PRESET_NAMES[tag] ?? tag
}

/** Description of a preset referenced by its tag (' ' when absent/empty). */
export function presetDescriptionByTag(tag: string | null | undefined, catalog: PresetLike[]): string {
  if (!tag) return ''
  return catalog.find((p) => p.tag === tag)?.description?.trim() ?? ''
}