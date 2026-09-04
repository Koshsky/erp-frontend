import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { ModalField, ModalFormProps } from '../components/common/ModalForm'

export interface EditModalResult {
  ok: boolean
  error?: string | null
}

/**
 * Edit/create modal: edit/saving/error state + ready-made props
 * for <ModalForm>. buildFields(state) builds fields, onSave(state, values) saves
 * and returns { ok, error } (error — text shown inside the modal).
 * getTitle/submitLabel provide the title and the button text for the state.
 */
export function useEditModal<T>(
  buildFields: (state: T) => ModalField[],
  onSave: (state: T, values: Record<string, string | number>) => Promise<EditModalResult>,
  getTitle: (state: T) => string,
  submitLabel?: (state: T) => string,
) {
  const edit: Ref<T | null> = ref(null)
  const saving = ref(false)
  const error: Ref<string | null> = ref(null)

  const fields = computed(() => (edit.value ? buildFields(edit.value) : []))
  const title = computed(() => (edit.value ? getTitle(edit.value) : ''))

  function open(state: T) {
    edit.value = state
    error.value = null
  }

  function close() {
    edit.value = null
  }

  async function submit(values: Record<string, string | number>) {
    if (!edit.value) return
    saving.value = true
    error.value = null
    const res = await onSave(edit.value, values)
    saving.value = false
    if (res.ok) {
      edit.value = null
    } else {
      error.value = res.error ?? null
    }
  }

  const bind = computed<ModalFormProps>(() => ({
    open: !!edit.value,
    title: title.value,
    fields: fields.value,
    busy: saving.value,
    error: error.value,
    submitLabel: edit.value && submitLabel ? submitLabel(edit.value) : undefined,
  }))

  return { edit, saving, error, fields, open, close, submit, bind }
}
