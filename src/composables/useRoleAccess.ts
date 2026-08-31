import { computed } from 'vue'
import { useAuthStore, usePlanningStore, useRbacStore } from '../store'

/**
 * Capabilities are driven by permissions from the RBAC matrix (/permissions/me),
 * not by a hardcoded role list: the frontend shows an action when the permission
 * exists (plus object ownership where the scope is not "all").
 */
export function useRoleAccess() {
  const auth = useAuthStore()
  const planning = usePlanningStore()
  const rbac = useRbacStore()

  const role = computed(() => auth.user?.role)
  const userId = computed(() => auth.user?.id)

  /** View/list projects: based on the project.view permission */
  const canViewProjects = computed(() => rbac.can('project', 'view'))

  /** Timesheet resource CRUD: based on resource.create/update permissions */
  const canManageResources = computed(() => rbac.can('resource', 'create') || rbac.can('resource', 'update'))

  /** Employee creation — admin only (worker.create): vp manages its subordinates but cannot create */
  const canCreateEmployee = computed(() => rbac.can('worker', 'create'))

  /** Processes (page and management): based on process.create/update permissions */
  const canManageProcesses = computed(() => rbac.can('process', 'create') || rbac.can('process', 'update'))

  /** Tasks/milestones/assignments: management via task.create/update */
  const canManageTasks = computed(() => rbac.can('task', 'create') || rbac.can('task', 'update'))

  /** View tasks (diagram and comments): task.view */
  const canViewTasks = computed(() => rbac.can('task', 'view'))

  /** Create project: project.create */
  const canCreateProject = computed(() => rbac.can('project', 'create'))

  /** Reorder project priorities: project.update */
  const canReorderProjects = computed(() => rbac.can('project', 'update'))

  /** Edit project: project.update permission + ownership (own) */
  function canManageProject(projectId: number): boolean {
    const project = planning.projectPlanning?.projects?.find((p: any) => p.id === projectId)
    return rbac.canOwn('project', 'update', { projectOwner: project?.owner_id ?? null })
  }

  /** Delete project: project.delete permission + ownership (own) */
  function canDeleteProject(projectId: number): boolean {
    const project = planning.projectPlanning?.projects?.find((p: any) => p.id === projectId)
    return rbac.canOwn('project', 'delete', { projectOwner: project?.owner_id ?? null })
  }

  /** "Employees" tab: worker.view */
  const canManageEmployees = computed(() => rbac.can('worker', 'view'))

  /** "Statuses" page (management): state.create/update */
  const canManageStates = computed(() => rbac.can('state', 'create') || rbac.can('state', 'update'))

  return {
    role,
    userId,
    canViewProjects,
    canManageResources,
    canCreateEmployee,
    canManageProcesses,
    canManageTasks,
    canViewTasks,
    canCreateProject,
    canReorderProjects,
    canManageProject,
    canDeleteProject,
    canManageEmployees,
    canManageStates,
  }
}
