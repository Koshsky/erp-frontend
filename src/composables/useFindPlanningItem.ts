import { usePlanningStore } from '../store'

/** Find tasks/milestones/processes/projects in the /planning/* tree (instead of scattered flatMap().find()) */
export function useFindPlanningItem() {
  const planning = usePlanningStore()

  function findTask(id: number) {
    return planning.taskPlanning?.processes
      ?.flatMap((p: any) => p.tasks ?? [])
      .find((x: any) => x.id === id)
  }

  function findMilestone(id: number) {
    return planning.taskPlanning?.processes
      ?.flatMap((p: any) => p.milestones ?? [])
      .find((x: any) => x.id === id)
  }

  function findProcess(id: number) {
    return planning.processPlanning?.projects
      ?.flatMap((p: any) => p.processes ?? [])
      .find((x: any) => x.id === id)
  }

  function findProject(id: number) {
    return planning.projectPlanning?.projects?.find((x: any) => x.id === id)
  }

  return { findTask, findMilestone, findProcess, findProject }
}
