import { resourcePageAccessible } from './resourceAccess'

export const PAGE_PERMISSIONS: Record<string, readonly [string, string]> = {
  timesheet: ['worker', 'view'],
  employees: ['worker', 'view'],
  projects: ['project', 'view'],
  processes: ['process', 'view'],
  planner: ['task', 'view'],
  resources: ['resource', 'view'],
  statuses: ['state_admin', 'view'],
  users: ['user_admin', 'view'],
  'user-new': ['user_admin', 'create'],
  'user-edit': ['user_admin', 'update'],
  'user-access': ['rbac_config', 'view'],
  structure: ['org_structure', 'view'],
  'auto-create': ['rbac_config', 'view'],
  permissions: ['rbac_config', 'view'],
  audit: ['audit', 'view'],
}

export function pageAllowed(name: string, can: (resource: string, action: string) => boolean): boolean {
  if (name === 'resources') return resourcePageAccessible(can)
  const needed = PAGE_PERMISSIONS[name]
  return !needed || can(...needed)
}
