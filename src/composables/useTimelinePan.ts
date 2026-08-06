import { ref } from 'vue'
import type { Ref } from 'vue'

export interface TimelinePan {
  isPanning: Ref<boolean>
  /** Подписка pointerdown на контейнер (pan по пустому месту ЛКМ) */
  enable: () => void
  /** Отписка */
  disable: () => void
}

/**
 * Панорамирование бесконечной шкалы: зажимаем ЛКМ на «пустом» месте
 * (не бары/лейблы/ручки — см. ignoreSelector) и тянем — контейнер
 * прокручивается в обе стороны. Горизонтальная прокрутка триггерит
 * штатное событие scroll, которое расширяет диапазон (sync).
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
    // Инкрементальные дельты: sync() при расширении левого диапазона сам
    // компенсирует scrollLeft, поэтому абсолютный пересчёт от старта драга
    // конфликтовал бы с компенсацией (пан «застревал» у origin).
    el.scrollLeft -= e.clientX - lastX
    el.scrollTop -= e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
  }

  function onPointerUp(e?: PointerEvent) {
    if (!active) return
    const el = container.value
    // Браузер коалесит быстрые pointermove — последнее движение может не дойти
    // до pointerup; дофлашиваем остаток дельты из координат события отпускания.
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
