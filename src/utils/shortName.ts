/**
 * Краткое ФИО «Фамилия И.О.» (фамилия + инициалы).
 * Строится из структурированных полей (last_name/first_name/middle_name), а при их
 * отсутствии — из готовой строки полного имени («Фамилия Имя Отчество»).
 * Пример: «Серебренников Вячеслав Алексеевич» → «Серебренников В.А.»
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
