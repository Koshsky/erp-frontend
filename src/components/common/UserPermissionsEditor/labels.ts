/**
 * Shared dictionaries of the permission matrix UI: resources, actions, groups
 * and human-readable scope options (mirrors the backend scope applicability).
 */

export interface ScopeOption {
  value: string
  label: string
}

/** Available scope EXPRESSIONS with human-readable labels in the resource
 *  context (mirrors the backend tree applicability: engine tree.go). The
 *  values are canonical expressions; free-form expressions are allowed too
 *  (the row input), these presets cover the common cases. */
export const SCOPE_OPTIONS: Record<string, ScopeOption[]> = {
  project: [
    { value: 'self', label: 'Свои' },
    { value: 'down', label: 'Поддерево' },
    { value: 'all', label: 'Все' },
  ],
  process: [
    { value: 'self', label: 'Свои' },
    { value: 'up1', label: 'Родители' },
    { value: 'up', label: 'Предки' },
    { value: 'sib', label: 'Сиблинги' },
    { value: 'down', label: 'Поддерево' },
    { value: 'all', label: 'Все' },
  ],
  task: [
    { value: 'self', label: 'Свои' },
    { value: 'up1', label: 'Родители' },
    { value: 'up', label: 'Предки' },
    { value: 'sib', label: 'Сиблинги' },
    { value: 'down', label: 'Поддерево' },
    { value: 'all', label: 'Все' },
  ],
  milestone: [
    { value: 'up1', label: 'Родители' },
    { value: 'up', label: 'Предки' },
    { value: 'all', label: 'Все' },
  ],
  assignment: [
    { value: 'up1', label: 'Родители' },
    { value: 'up', label: 'Предки' },
    { value: 'all', label: 'Все' },
  ],
  state: [{ value: 'all', label: 'Всё' }],
  resource: [
    { value: 'self', label: 'Свои' },
    { value: 'all', label: 'Все' },
  ],
  worker: [
    { value: 'self', label: 'Свои (подчинённые)' },
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
 *  zone (mirrors the backend applicability; canonical expressions). */
export const DEFAULT_GRANT_ZONE: Record<string, string> = {
  project: 'self',
  process: 'up1',
  task: 'up1',
  milestone: 'up1',
  assignment: 'up1',
  state: 'all',
  resource: 'self',
  worker: 'self',
  user_catalog: 'all',
  user_admin: 'all',
  rbac_config: 'all',
}