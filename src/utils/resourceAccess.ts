export const OWN_DEFAULT_RESOURCES = ['resource', 'project', 'process', 'task', 'milestone', 'assignment'] as const
export function resourcePageAccessible(can: (resource: string, action: string) => boolean): boolean {
  return ['view', 'create', 'update', 'delete'].some((action) => can('resource', action))
}
export function resourceHeaderRows<T extends { owner_id?: number }>(rows: T[], userId: number | null | undefined): T[] {
  return userId == null ? [] : rows.filter((row) => row.owner_id === userId)
}

export function resourceHeaderOwners<T extends { id?: number }>(users: T[], rows: { owner_id?: number }[]): T[] {
  const owners = new Set(rows.map(row => row.owner_id))
  return users.filter(user => user.id != null && owners.has(user.id))
}
