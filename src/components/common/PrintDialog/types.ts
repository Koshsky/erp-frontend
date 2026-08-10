import type { PlanningUnit } from '../../../components/planner/calendar'
import type { PrintOrientation } from '../../../composables/useDiagramPrint'

export interface PrintDialogProps {
  open: boolean
  unit: PlanningUnit
  scale: number
  orientation: PrintOrientation
}
