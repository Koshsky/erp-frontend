import { onBeforeUnmount } from 'vue'

export interface WindowPointerTrackOptions {
  onMove?: (e: PointerEvent) => void
  onUp?: (e: PointerEvent) => void
  onCancel?: () => void
}

/**
 * Отслеживание указателя на window во время драга: подписки pointermove/pointerup/
 * pointercancel и блокировка выделения (userSelect). start() включает, stop() — гасит.
 * При размонтировании посреди драга слушатели снимаются автоматически (без этого
 * они и userSelect=«none» оставались навсегда).
 */
export function useWindowPointerTrack(opts: WindowPointerTrackOptions) {
  function onMove(e: PointerEvent) {
    opts.onMove?.(e)
  }
  function onUp(e: PointerEvent) {
    opts.onUp?.(e)
  }
  function onCancel() {
    opts.onCancel?.()
  }

  function start() {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    document.body.style.userSelect = 'none'
  }

  function stop() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    document.body.style.userSelect = ''
  }

  onBeforeUnmount(stop)

  return { start, stop }
}
