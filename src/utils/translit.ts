/**
 * Cyrillic → Latin transliteration for building a default login (username)
 * from the full name. Mirrors the backend's transliteration table
 * (internal/security/creds/creds.go, creds.cyrToLat) so the preview in the
 * "Create user" dialog matches what the server would generate.
 */

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** Lowercase Latin transliteration of one word (non-Cyrillic chars are dropped). */
function translitWord(word: string): string {
  let out = ''
  for (const ch of word.toLowerCase()) {
    out += CYR_TO_LAT[ch] ?? ''
  }
  return out
}

/**
 * Default login built from the full name: translit(last).translit(first)[.translit(middle)].
 * Returns '' when there is nothing to transliterate (e.g. a Latin surname) — the
 * backend then generates the username itself.
 */
export function translitPhio(lastName: string, firstName: string, middleName = ''): string {
  const parts = [translitWord(lastName), translitWord(firstName)]
  if (middleName) parts.push(translitWord(middleName))
  return parts.filter(Boolean).join('.')
}