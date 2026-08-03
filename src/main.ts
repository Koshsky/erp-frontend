import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupHttp } from './http'

setupHttp()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
