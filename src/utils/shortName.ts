/**
 * Short name "Surname I.O." (surname + initials).
 * Built from structured fields (last_name/first_name/middle_name), or, when
 * they are absent, from an existing full-name string ("Surname First Middle").
 * Example: "Ivanov Ivan Ivanovich" → "Ivanov I.I."
 */
export function shortName(u?: {
  name?: string | null
  last_name?: string | null
  first_name?: string | null
  middle_name?: string | null
} | null): string {
  const hasStructured = Boolean(u && (u.last_name || u.first_name || u.middle_name))
  const parts = hasStructured
    ? [u?.last_name, u?.first_name, u?.middle_name].filter(Boolean) as string[]
    : (u?.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const [surname, ...rest] = parts
  const initials = rest.map((p) => `${p[0].toUpperCase()}.`).join('')
  return [surname, initials].filter(Boolean).join(' ')
}
