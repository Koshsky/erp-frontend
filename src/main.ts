import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupHttp } from './http'

setupHttp()

// Офлайн-доступ: регистрируем Service Worker только в проде (в dev ассеты не
// хэшируются, кэшировать их нельзя — сломало бы HMR). SW требует HTTPS или
// localhost.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.error('Ошибка регистрации Service Worker', e)
    })
  })
}

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
