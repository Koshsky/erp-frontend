/** Сравнение пользователей по ФИО (name), локаль ru, по возрастанию */
export function compareByName(a: { name?: string | null }, b: { name?: string | null }): number {
  return (a.name ?? '').localeCompare(b.name ?? '', 'ru')
}
