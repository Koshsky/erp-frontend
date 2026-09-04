import { createApp, watch } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupHttp } from './http'
import { initTheme } from './theme'
import { useAuthStore } from './store'
import { initOfflineSync, startSessionMaintenance } from './offline/sync'
import { startOfflineCycle } from './offline/cycle'
import { ensureCacheVersion } from './offline/cache'
import { isElectron } from './electron'

setupHttp()
initTheme()

// Pinia is activated before touching the stores (auto re-login for the exe): otherwise
// useXStore() outside setup would fail with "no active Pinia".
const pinia = createPinia()
setActivePinia(pinia)

// In Electron the offline machinery (queue, cache, network monitor) and the
// background session support start here. The silent auto re-login itself is
// deliberately NOT awaited before mount: it is a real HTTP request to the
// configured backend, and with a saved session + a stale/unreachable server
// address (an old profile can keep one) it used to leave the window blank for
// the whole request duration ("white screen"). First paint must never wait on
// it — the router guard performs the re-login with its own short bound
// (DESKTOP_AUTOSYNC_BOUND_MS) and a late success navigates in via the watcher
// below. The boot itself is still capped (BOOT_BOUND_MS) as a safety net.
const BOOT_BOUND_MS = 4000

async function bootstrapDesktop(): Promise<void> {
  try {
    // Drop the GET cache when the app version changed (payload shape may differ
    // between releases); the mutation queue is never touched.
    await ensureCacheVersion()
    await initOfflineSync()
    // The single 10-second maintenance cycle: probe + PUSH + PULL (see cycle.ts)
    startOfflineCycle()
    startSessionMaintenance()
  } catch (err) {
    // Never block the UI because of a broken offline/autosync init — surface it
    // in the log and render the login page anyway.
    console.error('[boot] desktop init failed, continuing to render:', err)
  }
}

if (isElectron) {
  await Promise.race([
    bootstrapDesktop(),
    new Promise((resolve) => setTimeout(resolve, BOOT_BOUND_MS)),
  ])
}

// Desktop: when a silent re-login (autosync) finishes AFTER the router guard
// already gave up waiting and redirected to /login, move the user into the app
// automatically (to the requested redirect target, like the login submit does).
// Offline logins are excluded via sessionMode — they manage their own navigation.
if (isElectron) {
  const auth = useAuthStore()
  watch(
    () => [auth.isAuthenticated, auth.sessionMode] as const,
    ([authenticated, sessionMode]) => {
      if (!authenticated || sessionMode !== 'online') return
      const current = router.currentRoute.value
      if (current.name !== 'login') return
      const redirect = typeof current.query.redirect === 'string' ? current.query.redirect : '/'
      void router.push(redirect)
    },
  )
}

console.log(`[build] ${__APP_VERSION__}`)

const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')
