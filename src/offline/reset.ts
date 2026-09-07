import { useAuthStore } from '@/store'
import { clearOutbox } from './outbox'

const DB_NAME = 'erp-offline'

function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
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
 * After clearing we reload the app — the first db.ts call recreates the
 * deleted database, and stores/other state start clean.
 *
 * Not touched here: app-independent preferences (api URL override, auto-sync
 * flag, RBAC perms cache, nav collapsed state) — they are not user data and
 * survive the reset. Targeted queue removals are available in outbox.ts
 * (clearOutbox / discardFailed / discardEntry / resetFailedRetries).
 */
export async function clearLocalData(): Promise<void> {
  await clearOutbox().catch(() => {})
  useAuthStore().logout()
  await deleteDb()
  window.location.reload()
}