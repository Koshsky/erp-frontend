import { ref } from 'vue'
import type { Ref } from 'vue'

export type NotificationKind = 'error' | 'success'

export interface NotificationItem {
  id: number
  kind: NotificationKind
  text: string
}

/** Auto-dismiss delay per kind: errors need reading time, successes are affirmations. */
const AUTO_DISMISS_MS: Record<NotificationKind, number> = {
  error: 8000,
  success: 4000,
}

/** Maximum visible notifications at once; the oldest one leaves first. */
const MAX_VISIBLE = 4

/**
 * Global notification queue consumed by NotificationHost (mounted in App.vue
 * next to the offline toasts). Module-level like offline/state.ts — any code
 * (axios interceptors, stores, views) can push without owning UI state.
 */
const notifications: Ref<NotificationItem[]> = ref([])

let nextId = 1
const timers = new Map<number, number>()

function dismiss(id: number): void {
  const timer = timers.get(id)
  if (timer != null) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
  notifications.value = notifications.value.filter((n) => n.id !== id)
}

function push(kind: NotificationKind, text: string): void {
  const id = nextId++
  notifications.value.push({ id, kind, text })
  const overflow = notifications.value.length - MAX_VISIBLE
  for (const gone of notifications.value.slice(0, overflow)) dismiss(gone.id)
  timers.set(id, window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS[kind]))
}

/** Fires a global error notification (auto-dismissed). */
export function notifyError(text: string): void {
  push('error', text)
}

/** Fires a global success notification (auto-dismissed, shorter). */
export function notifySuccess(text: string): void {
  push('success', text)
}

/** Closes a notification immediately (its ✕ button). */
export function dismissNotification(id: number): void {
  dismiss(id)
}

export { notifications }