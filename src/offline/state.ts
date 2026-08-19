import { ref } from 'vue'
import type { Ref } from 'vue'
import { isElectron } from '@/electron'

/**
 * Реактивное состояние сети. Обновляется событиями window online/offline и
 * фоновым пингом API (startConnectivityMonitor). Используется, чтобы офлайн
 * не выбрасывало на /login (refresh токена) и для баннера «офлайн-режим».
 *
 * Офлайн-режим существует ТОЛЬКО в настольной (Electron) сборке. В вебе
 * фронтенд считается строго онлайн: isOffline всегда false, монитор и
 * window-слушатели не активируются.
 */
export const isOffline: Ref<boolean> = ref(
  isElectron && typeof navigator !== 'undefined' && navigator.onLine === false,
)

if (isElectron && typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOffline.value = false
  })
  window.addEventListener('offline', () => {
    isOffline.value = true
  })
}

const PROBE_INTERVAL_MS = 15000
const PROBE_TIMEOUT_MS = 4000
/** Реальный endpoint без 404: отдаёт nginx, для SW это обычный ассет. */
const PROBE_URL = '/precache-manifest.json'
let probeTimer: number | null = null
let probed = false

/** Жив ли сервер: любой статус <500 = достижим, сетевая ошибка/5xx = нет */
async function probeReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    try {
      const res = await fetch(PROBE_URL, { cache: 'no-store', signal: ctrl.signal })
      return res.status < 500
    } finally {
      window.clearTimeout(timer)
    }
  } catch {
    return false
  }
}

/**
 * Фоновый мониторинг доступности сервера. navigator.onLine врёт («мёртвый
 * WiFi»), а при прогретых данных запросы к API не ходят — http-интерцептор не
 * срабатывает и isOffline остаётся false. Поэтому периодически пингуем реальный
 * endpoint (/precache-manifest.json), чтобы оранжевый баннер офлайна висел
 * всегда, пока сервер недоступен (даже когда кэш прогреты).
 */
export function startConnectivityMonitor(): void {
  // В браузерной (web) сборке офлайн-режима нет — монитор не запускаем.
  if (!isElectron) return
  if (probeTimer != null) return
  const tick = () => {
    void probeReachable().then((reachable) => {
      const wasOffline = isOffline.value
      isOffline.value = !reachable
      // Лог только на первый результат — для проверки работы монитора.
      if (!probed) {
        probed = true
        console.log(`[offline] probe: reachable=${reachable} → isOffline=${isOffline.value}`)
      }
    })
  }
  tick()
  probeTimer = window.setInterval(tick, PROBE_INTERVAL_MS)
}
