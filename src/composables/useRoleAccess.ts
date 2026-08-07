import { computed } from 'vue'
import { useAuthStore, usePlanningStore } from '../store'

/** Права доступа по роли пользователя (dp/rp/vp/admin/worker) */
export function useRoleAccess() {
  const auth = useAuthStore()
  const planning = usePlanningStore()

  const role = computed(() => auth.user?.role)
  const userId = computed(() => auth.user?.id)

  /** CRUD задач/процессов/ресурсов: запрещено только dp (директор портфеля) */
  const canManage = computed(() => role.value !== 'dp')

  /** Создание проекта: admin и rp (rp становится владельцем) */
  const canCreateProject = computed(() => role.value === 'admin' || role.value === 'rp')

  /** Переупорядочивание проектов (смена приоритетов): только admin и dp */
  const canReorderProjects = computed(() =>
    role.value === 'admin' || role.value === 'dp',
  )

  /** Редактирование/удаление проекта: admin — любой, rp — только свой */
  function canManageProject(projectId: number): boolean {
    if (role.value === 'admin') return true
    if (role.value !== 'rp') return false
    const project = planning.projectPlanning?.projects?.find((p: any) => p.id === projectId)
    return project?.owner_id != null && project.owner_id === userId.value
  }

  /** Вкладка «Сотрудники»: vp (свои подчинённые) и admin (все) */
  const canManageEmployees = computed(() => role.value === 'vp' || role.value === 'admin')

  /** Страница «Статусы»: vp и admin */
  const canManageStates = computed(() => role.value === 'vp' || role.value === 'admin')

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
    canManage,
    canCreateProject,
    canReorderProjects,
    canManageProject,
    canManageEmployees,
    canManageStates,
    canEditEmployee,
    canDeleteEmployee,
  }
}
