export interface ResourceOption {
  id: number
  title?: string
  code?: string
}

export interface AssignedResource {
  /** Идентификатор назначения (из /planning/tasks); отсутствует у старых данных */
  assignment_id?: number
  resource_id: number
  quantity: number
  title?: string
  code?: string
}

export interface AddResourcePayload {
  resource_id: number
  quantity: number
}

export interface ResourceManagerModalProps {
  open: boolean
  taskId: number
  taskTitle?: string
  resources: ResourceOption[]
  assigned: AssignedResource[]
  busy?: boolean
  error?: string | null
}
