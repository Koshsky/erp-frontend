import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

/**
 * Регистрация Service Worker (vite-plugin-pwa, registerType: 'autoUpdate').
 * Workbox генерирует sw.js на каждой сборке с precache-списком и ревизией,
 * поэтому браузер всегда видит новый скрипт и переустанавливает SW, а все
 * чанки (включая lazy-чанки неоткрытых страниц) попадают в кэш сразу.
 * При обновлении SW активируется сам (skipWaiting) и страница перезагружается.
 *
 * Продакшн-только: в dev ассеты не хэшируются, кэшировать их нельзя.
 */

export const swRegistration = ref<ServiceWorkerRegistration | null>(null)
/** Страница обслуживается активным SW (только после первого обновления) */
export const swControlled = ref(false)
/** Офлайн-оболочка готова (первая установка SW завершена) */
export const offlineReady = ref(false)

export function initServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return

  registerSW({
    immediate: true,
    onOfflineReady: () => {
      offlineReady.value = true
    },
    onRegistered: (reg) => {
      swRegistration.value = reg ?? null
    },
  })

  swControlled.value = navigator.serviceWorker.controller != null
  const onControlled = () => {
    swControlled.value = navigator.serviceWorker.controller != null
    if (swControlled.value) void cleanupLegacyCaches()
  }
  navigator.serviceWorker.addEventListener('controllerchange', onControlled)
  onControlled()

  // Обход 24-часового троттлинга проверок: reg.update() форсирует проверку
  // при каждом старте, поэтому после деплоя браузер на ближайшей онлайн-загрузке
  // сразу видит новый sw.js и переустанавливает SW (autoUpdate + reload).
  window.setTimeout(() => {
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.update().catch(() => {}))
      .catch(() => {})
  }, 3000)
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

/**
 * Одноразовая чистка кэшей старого нативного SW (erp-shell/erp-assets).
 * Удаляем их только когда новый Workbox-SW уже сделал свой precache, иначе
 * офлайн во время перехода мог бы остаться без ассетов.
 */
async function cleanupLegacyCaches(): Promise<void> {
  try {
    const names = await caches.keys()
    if (!names.some((n) => n.startsWith('workbox-precache'))) return
    await Promise.all(
      names
        .filter((n) => n === 'erp-shell' || n === 'erp-assets')
        .map((n) => caches.delete(n)),
    )
  } catch {
    // кэши недоступны (не в PWA-контексте) — пропускаем
  }
}
