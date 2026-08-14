import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupHttp } from './http'
import { initOfflineSync } from './offline/sync'
import { initServiceWorker } from './offline/registration'
import { startConnectivityMonitor } from './offline/state'

setupHttp()
await initOfflineSync()
initServiceWorker()
startConnectivityMonitor()

console.log(`[build] ${__APP_VERSION__}`)

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
