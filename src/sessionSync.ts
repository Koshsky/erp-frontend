/**
 * Cross-tab session coordination for the web build.
 *
 * The access token lives only in memory (per tab, see token.ts), while the
 * refresh token is a shared HttpOnly cookie. The backend rotates the refresh
 * session on every /auth/refresh, and presenting an already-rotated (revoked)
 * token is treated as theft: ALL of the user's sessions are revoked. Two tabs
 * refreshing at the same time therefore race: the first rotates the cookie,
 * the second sends the old token, triggers the family revocation — and every
 * tab is kicked to /login with "Session expired".
 *
 * This module adds a cross-tab mutex around the refresh (only one tab calls
 * /auth/refresh at a time) and broadcasts the freshly issued access token to
 * the sibling tabs, so they adopt it without their own refresh request.
 *
 * Desktop (Electron) does not use the refresh cookie (it re-logs in silently
 * with the auto-sync credentials), so nothing here applies there.
 */

const LOCK_KEY = 'mvs_erp_refresh_lock'
const TOKEN_BROADCAST_KEY = 'mvs_erp_session_token'
/** How long a refresh lock stays valid (a tab may die while holding it) */
const LOCK_TTL_MS = 15_000
const CHANNEL_NAME = 'mvs_erp_session'

/** Unique id of this tab (refresh lock owner and broadcast source) */
export const REFRESH_OWNER: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

let channel: BroadcastChannel | null = null
if (typeof BroadcastChannel !== 'undefined') {
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    channel = null
  }
}

interface RefreshLock {
  owner: string
  ts: number
}

function readLock(): RefreshLock | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    return raw ? (JSON.parse(raw) as RefreshLock) : null
  } catch {
    return null
  }
}

/** Claim the cross-tab refresh lock; false — another tab is refreshing right now */
export function tryAcquireRefreshLock(): boolean {
  const now = Date.now()
  const lock = readLock()
  if (lock && now - lock.ts < LOCK_TTL_MS && lock.owner !== REFRESH_OWNER) {
    return false
  }
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ owner: REFRESH_OWNER, ts: now }))
  } catch {
    // localStorage unavailable — fall back to uncoordinated refresh
  }
  return true
}

/** Release the refresh lock if it belongs to this tab */
export function releaseRefreshLock(): void {
  const lock = readLock()
  if (lock && lock.owner === REFRESH_OWNER) {
    try {
      localStorage.removeItem(LOCK_KEY)
    } catch {
      // ignore — the lock expires via TTL
    }
  }
}

/** Publish a freshly issued access token to sibling tabs */
export function publishToken(token: string): void {
  try {
    // BroadcastChannel first; the localStorage write doubles as a fallback
    // ("storage" fires in other tabs) and is harmless when the channel works.
    channel?.postMessage({ type: 'token', token })
    localStorage.setItem(TOKEN_BROADCAST_KEY, token)
  } catch {
    // ignore
  }
}

/** Subscribe to access tokens published by sibling tabs; returns an unsubscribe */
export function subscribeToken(cb: (token: string) => void): () => void {
  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; token?: string } | undefined
    if (data?.type === 'token' && typeof data.token === 'string') cb(data.token)
  }
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === TOKEN_BROADCAST_KEY && typeof ev.newValue === 'string') cb(ev.newValue)
  }
  channel?.addEventListener('message', onMessage)
  window.addEventListener('storage', onStorage)
  return () => {
    channel?.removeEventListener('message', onMessage)
    window.removeEventListener('storage', onStorage)
  }
}