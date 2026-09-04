/**
 * Shared dictionaries of the permission matrix UI: resources, actions, groups
 * and human-readable scope options (mirrors the backend scope applicability).
 */

export interface ScopeOption {
  value: string
  label: string
}

/** Available scopes with human-readable labels in the resource context. */
export const SCOPE_OPTIONS: Record<string, ScopeOption[]> = {
  project: [
    { value: 'own', label: 'Только свои' },
    { value: 'all', label: 'Все' },
  ],
  process: [
    { value: 'own', label: 'Только своё' },
    { value: 'parent', label: 'В своих проектах' },
    { value: 'ancestor', label: 'Свои и в своих проектах' },
    { value: 'all', label: 'Все' },
  ],
  task: [
    { value: 'own', label: 'Только своё' },
    { value: 'parent', label: 'В своих процессах' },
    { value: 'ancestor', label: 'Свои и в своих процессах/проектах' },
    { value: 'all', label: 'Все' },
  ],
  milestone: [
    { value: 'parent', label: 'В своих процессах' },
    { value: 'ancestor', label: 'Свои и в своих процессах/проектах' },
    { value: 'all', label: 'Все' },
  ],
  assignment: [
    { value: 'parent', label: 'В своих процессах' },
    { value: 'ancestor', label: 'Свои и в своих процессах/проектах' },
    { value: 'all', label: 'Все' },
  ],
  state: [{ value: 'all', label: 'Всё' }],
  resource: [
    { value: 'own', label: 'Только свои' },
    { value: 'all', label: 'Все' },
  ],
  worker: [
    { value: 'own', label: 'Только свои (подчинённые)' },
    { value: 'all', label: 'Все' },
  ],
  user_catalog: [{ value: 'all', label: 'Доступен' }],
  user_admin: [{ value: 'all', label: 'Доступен' }],
  rbac_config: [{ value: 'all', label: 'Доступен' }],
}

/** Page sections of the matrix. */
export const GROUPS: ReadonlyArray<{ key: string; title: string; resources: readonly string[] }> = [
  { key: 'planning', title: 'Планирование', resources: ['project', 'process', 'task', 'milestone', 'assignment'] },
  { key: 'timesheet', title: 'Табель', resources: ['state', 'resource', 'worker'] },
  { key: 'advanced', title: 'Дополнительные ресурсы', resources: ['user_catalog', 'user_admin', 'rbac_config'] },
]

export const ACTIONS = ['view', 'create', 'update', 'delete'] as const

/** Resource → human-readable name (genitive case, for "View …" phrases). */
export const RESOURCE_LABELS: Record<string, string> = {
  project: 'проектов',
  process: 'процессов',
  task: 'задач',
  milestone: 'вех',
  assignment: 'назначений ресурсов',
  state: 'статусов',
  resource: 'ресурсов табеля',
  worker: 'сотрудников',
  user_catalog: 'каталога пользователей',
  user_admin: 'пользователей',
  rbac_config: 'настроек администрирования',
}

export const ACTION_LABELS: Record<string, string> = {
  view: 'Просмотр',
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
}

/** Human-readable scope label in the resource context. */
export function scopeLabel(resource: string, scope: string): string {
  const opt = SCOPE_OPTIONS[resource]?.find((o) => o.value === scope)
  return opt?.label ?? scope
}

/** Default grant zone per resource when enabling a capability with no preset
 *  zone (mirrors the backend applicability; first applicable by order). */
export const DEFAULT_GRANT_ZONE: Record<string, string> = {
  project: 'own',
  process: 'parent',
  task: 'parent',
  milestone: 'parent',
  assignment: 'parent',
  state: 'all',
  resource: 'own',
  worker: 'own',
  user_catalog: 'all',
  user_admin: 'all',
  rbac_config: 'all',
}