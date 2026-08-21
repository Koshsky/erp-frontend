/** Полное ФИО «Фамилия Имя Отчество» из структурированных полей пользователя */
export function fullName(u?: {
  last_name?: string | null
  first_name?: string | null
  middle_name?: string | null
} | null): string {
  return [u?.last_name, u?.first_name, u?.middle_name].filter(Boolean).join(' ')
}
