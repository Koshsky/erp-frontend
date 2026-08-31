import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupHttp } from './http'
import { initTheme } from './theme'
import { initOfflineSync, ensureDesktopAutoSyncSession, startSessionMaintenance } from './offline/sync'
import { startConnectivityMonitor } from './offline/state'
import { isElectron } from './electron'

setupHttp()
initTheme()

// Pinia is activated before touching the stores (auto re-login for the exe): otherwise
// useXStore() outside setup would fail with "no active Pinia".
const pinia = createPinia()
setActivePinia(pinia)

// In Electron, at startup we try to silently restore the session from the saved
// (safeStorage) login+password so auto-sync works without manual login.
// The offline machinery (queue, cache, network monitor) and background session
// support are only in the desktop build.
if (isElectron) {
  await ensureDesktopAutoSyncSession()
  await initOfflineSync()
  startConnectivityMonitor()
  startSessionMaintenance()
}

console.log(`[build] ${__APP_VERSION__}`)

const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')
