/**
 * The badge preview takes no props on purpose: like `Bar`/`TaskBar` it reads the
 * live `viewSettings`, so the settings screen drives it directly (no plumbing),
 * and a story has nothing to wire — hence there is no `argTypes.ts` in this
 * folder. The demo scene is fixed (see the constants in the component).
 */
import type { Task } from '@/components/planner/TaskPlanning/components/TaskGantt/components/TaskBar/types'

/** The task the preview draws: every badge the settings can switch off. */
export type BadgePreviewTask = Task
