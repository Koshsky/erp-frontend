import { ref } from 'vue'
import type { Ref } from 'vue'

export interface TimelinePan {
  isPanning: Ref<boolean>
  /** Subscribe to pointerdown on the container (pan by dragging empty space with LMB) */
  enable: () => void
  /** Unsubscribe */
  disable: () => void
}

/**
 * Panning the infinite timeline: hold LMB on "empty" space (not bars/labels/
 * handles — see ignoreSelector) and drag — the container scrolls in both
 * directions. Horizontal scroll triggers the regular scroll event, which
 * extends the range (sync).
 */
export function useTimelinePan(
  container: Ref<HTMLElement | null>,
  ignoreSelector: string,
): TimelinePan {
  const isPanning = ref(false)

  let active = false
  let lastX = 0
  let lastY = 0

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return
    if (e.pointerType !== 'mouse') return
    const el = container.value
    if (!el) return
    if ((e.target as HTMLElement).closest(ignoreSelector)) return
    e.preventDefault()
    active = true
    lastX = e.clientX
    lastY = e.clientY
    isPanning.value = true
    el.classList.add('tg-panning')
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  function onPointerMove(e: PointerEvent) {
    if (!active) return
    const el = container.value
    if (!el) return
    // Incremental deltas: sync() itself compensates scrollLeft when the left
    // range expands, so an absolute recompute from drag start would conflict
    // with that compensation (the pan would "stick" at the origin).
    el.scrollLeft -= e.clientX - lastX
    el.scrollTop -= e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
  }

  function onPointerUp(e?: PointerEvent) {
    if (!active) return
    const el = container.value
    // The browser coalesces fast pointermove events — the last move may not
    // reach pointerup; flush the remaining delta from the release event coords.
    if (el && e) {
      el.scrollLeft -= e.clientX - lastX
      el.scrollTop -= e.clientY - lastY
    }
    active = false
    isPanning.value = false
    container.value?.classList.remove('tg-panning')
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  }

  function enable() {
    container.value?.addEventListener('pointerdown', onPointerDown)
  }

  function disable() {
    container.value?.removeEventListener('pointerdown', onPointerDown)
    onPointerUp()
  }

  return { isPanning, enable, disable }
}
