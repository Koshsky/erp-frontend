import { useAuthStore } from '@/store'
import { clearOutbox } from './outbox'
import { closeDb } from './db'

const DB_NAME = 'erp-offline'
/** How long to wait for a blocked deleteDatabase (another window may close) */
const DELETE_TIMEOUT_MS = 3000

/**
 * Deletes the database and reports what actually happened. The promise must
 * NOT resolve on "blocked"/"error": that reported success while the database
 * was still there (H-OFF-2). Another window holding a connection keeps the
 * request blocked until it is closed.
 */
function deleteDb(): Promise<'ok' | 'error' | 'blocked'> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.deleteDatabase(DB_NAME)
    } catch {
      resolve('error')
      return
    }
    req.onsuccess = () => resolve('ok')
    req.onerror = () => resolve('error')
    req.onblocked = () => resolve('blocked')
  })
}

/** deleteDb with a bound: a blocked request may still succeed once the other
 *  window closes, but we do not wait forever. */
function deleteDbWithTimeout(): Promise<'ok' | 'error' | 'blocked' | 'timeout'> {
  return Promise.race([
    deleteDb(),
    new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), DELETE_TIMEOUT_MS)),
  ])
}

/**
 * Full reset of local data — the single explicit user action that wipes
 * everything stored locally (see docs/no-ttl-local-storage.md; this is one of
 * the only legitimate removal paths, alongside logout and version-based cache
 * invalidation).
 *
 * What is cleared:
 *  - the IndexedDB database `erp-offline` (all stores: `cache` GET responses,
 *    `outbox` mutation queue, `idmap` temp→real id mappings) via deleteDatabase;
 *  - the in-memory access token (useAuthStore().logout → setAccessToken(null));
 *  - the user DTO from localStorage (`mvs_erp_user`);
 *  - the server-side refresh session: logout() calls POST /auth/logout
 *    (best-effort) which revokes the session and clears the HttpOnly refresh
 *    cookie;
 *  - the logged-out marker (only a manual login will re-enable auto-sync on
 *    the desktop build).
 *
 * Returns true when the database was really deleted and the app reloaded;
 * false when the deletion could not be completed (another window/tab keeps a
 * connection open — the user is told to close it and retry). Never reloads on
 * a failed deletion.
 *
 * Not touched here: app-independent preferences (api URL override, auto-sync
 * flag, RBAC perms cache, nav collapsed state) — they are not user data and
 * survive the reset. Targeted queue removals are available in outbox.ts
 * (clearOutbox / discardFailed / discardEntry / resetFailedRetries).
 */
export async function clearLocalData(): Promise<boolean> {
  await clearOutbox().catch(() => {})
  useAuthStore().logout()
  // Close OUR connection first: an open connection of this very tab blocks its
  // own deleteDatabase, so the reset used to be a silent no-op (H-OFF-2).
  await closeDb().catch(() => {})
  const result = await deleteDbWithTimeout()
  if (result !== 'ok') return false
  window.location.reload()
  return true
}
