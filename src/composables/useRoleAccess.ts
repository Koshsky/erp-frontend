import { computed } from 'vue'
import { useAuthStore, usePlanningStore, useRbacStore } from '../store'

/**
 * Возможности определяются правами из матрицы RBAC (/permissions/me),
 * а не хардкод-списком ролей: фронт показывает действие, если есть право
 * (и владение объектом там, где скоуп не «все»).
 */
export function useRoleAccess() {
  const auth = useAuthStore()
  const planning = usePlanningStore()
  const rbac = useRbacStore()

  const role = computed(() => auth.user?.role)
  const userId = computed(() => auth.user?.id)

  /** Просмотр/листинг проектов: по праву project.view */
  const canViewProjects = computed(() => rbac.can('project', 'view'))

  /** CRUD ресурсов табеля: по правам resource.create/update */
  const canManageResources = computed(() => rbac.can('resource', 'create') || rbac.can('resource', 'update'))

  /** Создание сотрудников — только admin (worker.create): vp управляет своими подчинёнными, но не создаёт */
  const canCreateEmployee = computed(() => rbac.can('worker', 'create'))

  /** Процессы (страница и управление): по правам process.create/update */
  const canManageProcesses = computed(() => rbac.can('process', 'create') || rbac.can('process', 'update'))

  /** Задачи/вехи/назначения: управление по task.create/update */
  const canManageTasks = computed(() => rbac.can('task', 'create') || rbac.can('task', 'update'))

  /** Просмотр задач (диаграмма и комментарии): task.view */
  const canViewTasks = computed(() => rbac.can('task', 'view'))

  /** Создание проекта: project.create */
  const canCreateProject = computed(() => rbac.can('project', 'create'))

  /** Смена приоритетов проектов: project.update */
  const canReorderProjects = computed(() => rbac.can('project', 'update'))

  /** Редактирование проекта: право project.update + владение (own) */
  function canManageProject(projectId: number): boolean {
    const project = planning.projectPlanning?.projects?.find((p: any) => p.id === projectId)
    return rbac.canOwn('project', 'update', { projectOwner: project?.owner_id ?? null })
  }

  /** Удаление проекта: право project.delete + владение (own) */
  function canDeleteProject(projectId: number): boolean {
    const project = planning.projectPlanning?.projects?.find((p: any) => p.id === projectId)
    return rbac.canOwn('project', 'delete', { projectOwner: project?.owner_id ?? null })
  }

  /** Вкладка «Сотрудники»: worker.view */
  const canManageEmployees = computed(() => rbac.can('worker', 'view'))

  /** Страница «Статусы» (управление): state.create/update */
  const canManageStates = computed(() => rbac.can('state', 'create') || rbac.can('state', 'update'))

  /** Право изменить сотрудника: worker.update + владение (own: manager_id) */
  function canEditEmployee(emp: { manager_id?: number | null }): boolean {
    return rbac.canOwn('worker', 'update', { owner: emp.manager_id ?? null })
  }

  const canDeleteEmployee = canEditEmployee

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
    canEditEmployee,
    canDeleteEmployee,
  }
}
