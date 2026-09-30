import { ref } from 'vue'
import type { Ref } from 'vue'

export type NotificationKind = 'error' | 'success' | 'info'

export interface NotificationItem {
  id: number
  kind: NotificationKind
  text: string
  /** Live duration of the auto-dismiss countdown — the timer bar uses the same value. */
  durationMs: number
}

/** Default auto-dismiss per kind: errors need reading time, the others are affirmations. */
const DURATION_MS: Record<NotificationKind, number> = {
  error: 5000,
  success: 4000,
  info: 4000,
}

/** Maximum visible notifications at once; the oldest one leaves first. */
const MAX_VISIBLE = 4

/**
 * Generic global notification queue consumed by NotificationHost (mounted in
 * App.vue next to the offline toasts). Module-level like offline/state.ts —
 * any code (axios interceptors, stores, views) can push without owning UI
 * state. The stack itself is purpose-agnostic: the HTTP interceptor is just
 * one consumer (errors of failed mutations).
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

function push(kind: NotificationKind, text: string, durationMs: number): void {
  const id = nextId++
  notifications.value.push({ id, kind, text, durationMs })
  const overflow = notifications.value.length - MAX_VISIBLE
  for (const gone of notifications.value.slice(0, overflow)) dismiss(gone.id)
  timers.set(id, window.setTimeout(() => dismiss(id), durationMs))
}

/**
 * Pushes a notification onto the global stack. `durationMs` overrides the
 * per-kind default (error 5 s, success/info 4 s).
 */
export function notify(kind: NotificationKind, text: string, durationMs?: number): void {
  push(kind, text, durationMs ?? DURATION_MS[kind])
}

/** Fires a global error notification (auto-dismissed after 5 s). */
export function notifyError(text: string): void {
  notify('error', text)
}

/** Fires a global success notification (auto-dismissed after 4 s). */
export function notifySuccess(text: string): void {
  notify('success', text)
}

/** Fires a global info notification (auto-dismissed after 4 s). */
export function notifyInfo(text: string): void {
  notify('info', text)
}

/** Closes a notification immediately (its ✕ button). */
export function dismissNotification(id: number): void {
  dismiss(id)
}

export { notifications }