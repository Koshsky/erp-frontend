import { computed } from 'vue'
import { useAuthStore, usePlanningStore } from '../store'

/** Права доступа по роли пользователя (dp/rp/vp/admin/worker) */
export function useRoleAccess() {
  const auth = useAuthStore()
  const planning = usePlanningStore()

  const role = computed(() => auth.user?.role)
  const userId = computed(() => auth.user?.id)

  /** Просмотр/листинг проектов: admin/dp — все, rp — свои; vp и worker проекты не видят */
  const canViewProjects = computed(() => {
    return role.value === 'admin' || role.value === 'dp' || role.value === 'rp'
  })

  /** CRUD ресурсов табеля: admin и vp (vp — свои) */
  const canManageResources = computed(() => role.value === 'admin' || role.value === 'vp')

  /** Процессы (страница процессов): admin и rp — в своих проектах (список уже отфильтрован) */
  const canManageProcesses = computed(() => role.value === 'admin' || role.value === 'rp')

  /** Задачи/вехи/назначения (страница задач): admin и vp — в своих процессах; rp — view only */
  const canManageTasks = computed(() => role.value === 'admin' || role.value === 'vp')

  /** Создание проекта: admin и rp (rp становится владельцем) */
  const canCreateProject = computed(() => role.value === 'admin' || role.value === 'rp')

  /** Переупорядочивание проектов (смена приоритетов): admin/dp — все, rp — свои
   *  (список rp уже отфильтрован бэкендом до его проектов) */
  const canReorderProjects = computed(() =>
    role.value === 'admin' || role.value === 'dp' || role.value === 'rp',
  )

  /** Редактирование проекта: admin — любой, dp — все, rp — только свой */
  function canManageProject(projectId: number): boolean {
    if (role.value === 'admin' || role.value === 'dp') return true
    if (role.value !== 'rp') return false
    const project = planning.projectPlanning?.projects?.find((p: any) => p.id === projectId)
    return project?.owner_id != null && project.owner_id === userId.value
  }

  /** Удаление проекта: admin — любой, rp — только свой; dp не удаляет */
  function canDeleteProject(projectId: number): boolean {
    if (role.value === 'admin') return true
    if (role.value !== 'rp') return false
    const project = planning.projectPlanning?.projects?.find((p: any) => p.id === projectId)
    return project?.owner_id != null && project.owner_id === userId.value
  }

  /** Вкладка «Сотрудники»: vp (свои подчинённые) и admin (все) */
  const canManageEmployees = computed(() => role.value === 'vp' || role.value === 'admin')

  /** Страница «Статусы»: только admin */
  const canManageStates = computed(() => role.value === 'admin')

  /** Право изменить сотрудника: admin — любого, остальные — только подчинённых */
  function canEditEmployee(emp: { manager_id?: number | null }): boolean {
    if (role.value === 'admin') return true
    return emp.manager_id != null && emp.manager_id === userId.value
  }

  /** Право удалить сотрудника: то же правило, что и на редактирование */
  const canDeleteEmployee = canEditEmployee

  return {
    role,
    userId,
    canViewProjects,
    canManageResources,
    canManageProcesses,
    canManageTasks,
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
