/** A subtask (operation) row in the task editor todo list. */
export interface SubtaskItem {
  id: number
  title: string
  color?: string
  status?: string
}

/** The task being edited — the left panel values. */
export interface TaskEditorTask {
  id: number
  title: string
  color?: string
  status?: string
  owner_id?: number | null
  process_id: number
}

export interface OwnerOption {
  value: number
  label: string
}

/** Patch emitted by the left panel (status/owner/title/color). owner_id is
 *  included only when a user is actually selected (null — not sent). */
export interface TaskEditorPatch {
  title?: string
  color?: string
  status?: string
  owner_id?: number
}

export interface NewSubtaskPayload {
  title: string
  color?: string
  status?: string
}

export interface UpdateSubtaskPayload {
  id: number
  patch: { title?: string; color?: string; status?: string }
}

export interface TaskEditorProps {
  /** Modal visibility */
  open: boolean
  /** The edited task (null — header shows a placeholder) */
  task: TaskEditorTask | null
  /** Subtask list (right panel) */
  subtasks: SubtaskItem[]
  /** Employees for the "owner" select */
  ownerOptions: OwnerOption[]
  /** Whether the user can change the task (status/owner/title/color) */
  canManage?: boolean
  /** Whether the user can add subtasks (same as canManage) */
  canCreateSubtask?: boolean
  busy?: boolean
  error?: string | null
  /** Subtask form is disabled — shown instead of a spinner */
  disabledReason?: string | null
}

export interface TaskEditorEmits {
  /** Left panel: save the edited task fields */
  save: [patch: TaskEditorPatch]
  /** Right panel: add a subtask */
  addSubtask: [payload: NewSubtaskPayload]
  /** Right panel: update a subtask field */
  updateSubtask: [payload: UpdateSubtaskPayload]
  /** Right panel: delete a subtask */
  deleteSubtask: [id: number]
  close: []
}