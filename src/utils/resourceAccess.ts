export const OWN_DEFAULT_RESOURCES = ['resource', 'project', 'process', 'task', 'milestone', 'assignment'] as const
export function resourcePageAccessible(can: (resource: string, action: string) => boolean): boolean {
  return ['view', 'create', 'update', 'delete'].some((action) => can('resource', action))
}
export function resourceHeaderRows<T extends { owner_id?: number }>(rows: T[], userId: number | null | undefined): T[] {
  return userId == null ? [] : rows.filter((row) => row.owner_id === userId)
}
