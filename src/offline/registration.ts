import { ref } from 'vue'

/**
 * Регистрация Service Worker + «активные» проверки обновлений.
 * Продакшн-только: в dev ассеты не хэшируются, кэшировать их нельзя.
 *
 * Обновление фронтенда: sw.js перегенерируется на каждой сборке, браузер видит
 * новый скрипт и ставит новый SW (у нас — сразу, через skipWaiting). Чтобы не
 * ждать перезагрузки вкладки, проверяем обновления при возврате вкладки,
 * фокусе окна и раз в час.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000

export const swRegistration = ref<ServiceWorkerRegistration | null>(null)
/** Страница обслуживается активным SW (только после первого обновления) */
export const swControlled = ref(false)
/** Обнаружен новый SW — нужен перезапуск страницы для нового бандла */
export const updateAvailable = ref(false)

export function initServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return

  window.addEventListener('load', () => {
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        swRegistration.value = reg
        swControlled.value = navigator.serviceWorker.controller != null
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          swControlled.value = navigator.serviceWorker.controller != null
        })

        const check = () => {
          void reg.update().catch(() => {})
        }
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check()
        })
        window.addEventListener('focus', check)
        window.setInterval(check, CHECK_INTERVAL_MS)

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing ?? reg.waiting
          if (!nw) return
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              updateAvailable.value = true
            }
          })
        })
      } catch (e) {
        console.error('Ошибка регистрации Service Worker', e)
      }
    })()
  })
}

/** Форсирует проверку обновлений (кнопка «Проверить обновление») */
export async function checkForUpdates(): Promise<boolean> {
  const reg = swRegistration.value
  if (!reg) return false
  try {
    await reg.update()
  } catch {
    return false
  }
  return true
}

/** Перезагрузка со свежим SW/бандлом (наш SW делает skipWaiting при установке) */
export function applyUpdate(): void {
  const reg = swRegistration.value
  const nw = reg?.waiting ?? reg?.installing
  if (nw) nw.postMessage({ type: 'SKIP_WAITING' })
  window.setTimeout(() => window.location.reload(), 300)
}
