import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupHttp } from './http'
import { initOfflineSync, ensureDesktopAutoSyncSession } from './offline/sync'
import { startConnectivityMonitor } from './offline/state'

setupHttp()

// Pinia активируем до обращения к сторам (авторелогin для exe): иначе
// useXStore() вне setup упадёт «no active Pinia».
const pinia = createPinia()
setActivePinia(pinia)

// В Electron при старте пробуем тихо восстановить сессию по сохранённым
// (safeStorage) логину+паролю, чтобы автосинк работал без ручного входа.
await ensureDesktopAutoSyncSession()

await initOfflineSync()
startConnectivityMonitor()

console.log(`[build] ${__APP_VERSION__}`)

const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')
