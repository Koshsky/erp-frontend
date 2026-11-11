/**
 * Shared dictionaries of the permission matrix UI: resources, actions, groups
 * and human-readable scope options (mirrors the backend scope applicability).
 *
 * The machine codes (resource keys, action codes, scope expressions such as
 * `self` / `up1` / `down`) are data; their human text lives in the message
 * catalog (`adminConfig.perm.*`) and is resolved through `t()` at CALL time —
 * never at module load, so a language switch re-renders the UI.
 */
import { t } from '@/i18n'

export interface ScopeOption {
  value: string
  /** Catalog key of the option label (resolved with `t('adminConfig.perm.zone.' + label)`). */
  label: string
}

/** Scope zone codes with human-readable labels in the resource context
 *  (mirrors the backend tree applicability: engine tree.go). The values are
 *  canonical expressions; the map is keyed by resource code. */
export const SCOPE_OPTIONS: Record<string, ScopeOption[]> = {
  project: [
    { value: 'self', label: 'selfUpper' },
    { value: 'down', label: 'down' },
    { value: 'all', label: 'all' },
  ],
  process: [
    { value: 'self', label: 'selfUpper' },
    { value: 'up1', label: 'up1' },
    { value: 'up', label: 'up' },
    { value: 'sib', label: 'sib' },
    { value: 'down', label: 'down' },
    { value: 'all', label: 'all' },
  ],
  task: [
    { value: 'self', label: 'selfUpper' },
    { value: 'up1', label: 'up1' },
    { value: 'up', label: 'up' },
    { value: 'sib', label: 'sib' },
    { value: 'down', label: 'down' },
    { value: 'all', label: 'all' },
  ],
  milestone: [
    { value: 'up1', label: 'up1' },
    { value: 'up', label: 'up' },
    { value: 'all', label: 'all' },
  ],
  assignment: [
    { value: 'up1', label: 'up1' },
    { value: 'up', label: 'up' },
    { value: 'all', label: 'all' },
  ],
  state: [{ value: 'all', label: 'allStates' }],
  resource: [
    { value: 'self', label: 'selfUpper' },
    { value: 'all', label: 'all' },
  ],
  worker: [
    { value: 'self', label: 'selfSubordinates' },
    { value: 'all', label: 'all' },
  ],
  user_catalog: [{ value: 'all', label: 'available' }],
  user_admin: [{ value: 'all', label: 'available' }],
  rbac_config: [{ value: 'all', label: 'available' }],
}

/** Page sections of the matrix (`key` is the catalog key of the title). */
export const GROUPS: ReadonlyArray<{ key: string; resources: readonly string[] }> = [
  { key: 'planning', resources: ['project', 'process', 'task', 'milestone', 'assignment'] },
  { key: 'timesheet', resources: ['state', 'resource', 'worker'] },
  { key: 'advanced', resources: ['user_catalog', 'user_admin', 'rbac_config'] },
]

export const ACTIONS = ['view', 'create', 'update', 'delete'] as const

/** Resource → human-readable name (genitive case, for "View …" phrases). */
export function resourceLabel(resource: string): string {
  return t(`adminConfig.perm.resource.${resource}`)
}

/** Resource → human-readable name (nominative case, cards and headers). */
export function resourceTitle(resource: string): string {
  return t(`adminConfig.perm.resourceTitle.${resource}`)
}

/** Action code → human-readable name. */
export function actionTitle(action: string): string {
  return t(`adminConfig.perm.action.${action}`)
}

/** Scope option label in the resource context (falls back to the code itself). */
export function scopeOptionLabel(resource: string, scope: string): string {
  const opt = SCOPE_OPTIONS[resource]?.find((o) => o.value === scope)
  return opt ? t(`adminConfig.perm.zone.${opt.label}`) : scope
}

/** Section title of a matrix group. */
export function groupTitle(key: string): string {
  return t(`adminConfig.perm.group.${key}`)
}

/** Human-readable scope label in the resource context. */
export function scopeLabel(resource: string, scope: string): string {
  return scopeOptionLabel(resource, scope)
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
