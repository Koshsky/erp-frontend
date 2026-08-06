import { ref } from 'vue'
import type { Ref } from 'vue'

export interface ConfirmState {
  message: string
  confirmLabel?: string
  /** Вызывается при подтверждении (после закрытия диалога) */
  onConfirm: () => void
}

/**
 * Встроенный диалог подтверждения вместо window.confirm.
 * window.confirm блокируется в iframe/песочнице и возвращает false — тогда
 * обработчики удаления обрывались до отправки DELETE. ask() открывает диалог,
 * proceed() подтверждает, cancel() отменяет.
 */
export function useConfirm() {
  const confirm: Ref<ConfirmState | null> = ref(null)

  function ask(message: string, onConfirm: () => void, confirmLabel?: string) {
    confirm.value = { message, onConfirm, confirmLabel }
  }

  function proceed() {
    const c = confirm.value
    if (!c) return
    confirm.value = null
    c.onConfirm()
  }

  function cancel() {
    confirm.value = null
  }

  return { confirm, ask, proceed, cancel }
}
