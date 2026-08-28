export interface ModalFieldOption {
  value: number | string
  label: string
}

export interface ModalField {
  /** Field key — name in the payload when saving (save(values)) */
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'date'
  /** Initial value (applied when opened) */
  value?: number | string
  /** Options for type: 'select' */
  options?: ModalFieldOption[]
  required?: boolean
  placeholder?: string
}

export interface ModalFormProps {
  /** Modal visibility */
  open: boolean
  /** Dialog title */
  title: string
  /** Description of form fields; not needed if the default slot is used */
  fields?: ModalField[]
  /** Confirmation button text; defaults to "Save" */
  submitLabel?: string
  /** Saving in progress: the button is disabled and a spinner is shown */
  busy?: boolean
  /** Error text inside the modal */
  error?: string | null
}
