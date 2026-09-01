import { computed } from 'vue'
import { useAuthStore, usePlanningStore, useRbacStore } from '../store'

type OwnerId = number | null | undefined

/**
 * Capabilities are driven by permissions from the RBAC matrix (/permissions/me),
 * not by a hardcoded role list: the frontend shows an action when the permission
 * exists (plus object ownership where the scope is not "all"). Every helper here
 * mirrors the backend route policy for the same action.
 */
export function useRoleAccess() {
  const auth = useAuthStore()
  const planning = usePlanningStore()
  const rbac = useRbacStore()

  const role = computed(() => auth.user?.role)
  const userId = computed(() => auth.user?.id)

  // === Projects ===

  /** View/list projects: project.view */
  const canViewProjects = computed(() => rbac.can('project', 'view'))

  /** Create project: project.create */
  const canCreateProject = computed(() => rbac.can('project', 'create'))

  /** Reorder project priorities: project.update */
  const canReorderProjects = computed(() => rbac.can('project', 'update'))

  /** Parent project owner of a process (process.update/delete — parent scope) */
  function processProjectOwner(processId: number): OwnerId {
    const project = planning.processPlanning?.projects?.find((p: any) =>
      (p.processes ?? []).some((pr: any) => pr.id === processId),
    )
    return project?.project?.owner_id ?? null
  }

  /** Process owner of a task/milestone (task/milestone.update — parent scope) */
  function processOwner(processId: OwnerId): OwnerId {
    if (processId == null) return null
    return planning.taskPlanning?.processes?.find((p: any) => p.id === processId)?.owner_id ?? null
  }

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

  // === Processes ===

  /** Create process: process.create */
  const canCreateProcess = computed(() => rbac.can('process', 'create'))

  /** Edit process: process.update + parent (the parent project owner) */
  function canManageProcess(processId: number): boolean {
    return rbac.canOwn('process', 'update', { projectOwner: processProjectOwner(processId) })
  }

  /** Delete process: process.delete + parent (the parent project owner) */
  function canDeleteProcess(processId: number): boolean {
    return rbac.canOwn('process', 'delete', { projectOwner: processProjectOwner(processId) })
  }

  /** Reorder processes of a project: process.update + parent */
  function canReorderProcess(projectOwner: OwnerId): boolean {
    return rbac.canOwn('process', 'update', { projectOwner: projectOwner ?? null })
  }

  // === Tasks / milestones ===

  /** Create a task in a process: task.create + parent */
  function canCreateTask(processId: OwnerId): boolean {
    return rbac.canOwn('task', 'create', { processOwner: processOwner(processId) })
  }

  /** Edit task: task.update + parent */
  function canManageTask(processId: OwnerId): boolean {
    return rbac.canOwn('task', 'update', { processOwner: processOwner(processId) })
  }

  /** Delete task: task.delete + parent */
  function canDeleteTask(processId: OwnerId): boolean {
    return rbac.canOwn('task', 'delete', { processOwner: processOwner(processId) })
  }

  /** Assign/remove resources on a task: assignment.create + parent (owner_match, admin exempt) */
  function canAssignTaskResources(processId: OwnerId): boolean {
    return rbac.canOwn('assignment', 'create', { processOwner: processOwner(processId) })
  }

  /** Create a milestone in a process: milestone.create + parent */
  function canCreateMilestone(processId: OwnerId): boolean {
    return rbac.canOwn('milestone', 'create', { processOwner: processOwner(processId) })
  }

  /** Edit milestone: milestone.update + parent */
  function canManageMilestone(processId: OwnerId): boolean {
    return rbac.canOwn('milestone', 'update', { processOwner: processOwner(processId) })
  }

  /** Delete milestone: milestone.delete + parent */
  function canDeleteMilestone(processId: OwnerId): boolean {
    return rbac.canOwn('milestone', 'delete', { processOwner: processOwner(processId) })
  }

  /** View tasks (diagram and comments): task.view; the backend allows adding
   *  comments with the same right (task.comment.create == task.view). */
  const canViewTasks = computed(() => rbac.can('task', 'view'))
  const canAddComment = canViewTasks

  /** Delete comments of other authors: task.update (the author deletes own) */
  const canDeleteOthersComments = computed(() => rbac.can('task', 'update'))

  // === Resources ===

  /** Create a resource: resource.create */
  const canCreateResource = computed(() => rbac.can('resource', 'create'))

  /** Edit resource / manage its members: resource.update + ownership (own) */
  function canManageResource(ownerId: OwnerId): boolean {
    return rbac.canOwn('resource', 'update', { owner: ownerId ?? null })
  }

  /** Delete resource: resource.delete + ownership (own) */
  function canDeleteResource(ownerId: OwnerId): boolean {
    return rbac.canOwn('resource', 'delete', { owner: ownerId ?? null })
  }

  // === States (ownerless dictionary) ===

  const canCreateState = computed(() => rbac.can('state', 'create'))
  const canManageState = computed(() => rbac.can('state', 'update'))
  const canDeleteState = computed(() => rbac.can('state', 'delete'))

  // === Timecard (worker days) ===

  /** Set employee days: worker.update + ownership (own: manager_id) */
  function canAssignEmployeeDays(managerId: OwnerId): boolean {
    return rbac.canOwn('worker', 'update', { owner: managerId ?? null })
  }

  /** Clear employee days: worker.delete + ownership (own: manager_id) */
  function canClearEmployeeDays(managerId: OwnerId): boolean {
    return rbac.canOwn('worker', 'delete', { owner: managerId ?? null })
  }

  return {
    role,
    userId,
    canViewProjects,
    canCreateProject,
    canReorderProjects,
    canManageProject,
    canDeleteProject,
    canCreateProcess,
    canManageProcess,
    canDeleteProcess,
    canReorderProcess,
    canCreateTask,
    canManageTask,
    canDeleteTask,
    canAssignTaskResources,
    canCreateMilestone,
    canManageMilestone,
    canDeleteMilestone,
    canViewTasks,
    canAddComment,
    canDeleteOthersComments,
    canCreateResource,
    canManageResource,
    canDeleteResource,
    canCreateState,
    canManageState,
    canDeleteState,
    canAssignEmployeeDays,
    canClearEmployeeDays,
  }
}