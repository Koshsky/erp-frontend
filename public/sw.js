/**
 * Service Worker для офлайн-доступа к SPA (нативная реализация, без плагинов).
 *
 * Стратегии:
 *  - навигация (HTML-документы): network-first → fallback на закэшированный /index.html;
 *  - хэшированные ассеты /assets/*: cache-first (имена содержат хэш сборки, поэтому
 *    контент иммутабелен, старый кэш чистится при активации по ссылкам нового index.html);
 *  - статические файлы (/manifest.webmanifest, иконки): cache-first;
 *  - /api/* и всё остальное: не перехватываем (фолбэк на IndexedDB делает axios в src/http.ts).
 *
 * Обновление фронтенда: браузер проверяет sw.js на каждой навигации, новый SW
 * ставится в фоне и сразу активируется (skipWaiting), затем чистит устаревшие
 * кэши. index.html всегда отдаётся по сети, поэтому пользователь получает
 * свежие ссылки на новые хэшированные чанки.
 */

const SHELL_CACHE = 'erp-shell'
const ASSETS_CACHE = 'erp-assets'

/** Список файлов, которые должны быть доступны офлайн сразу после установки */
const SHELL_FILES = ['/index.html', '/manifest.webmanifest', '/icons/icon.svg']

/** Ассеты, которые уже нельзя изменить (имя содержит хэш сборки) */
function isHashedAsset(pathname) {
  return pathname.startsWith('/assets/')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL_FILES.map((file) => cache.add(file).catch(() => {}))))
      .then(() => self.skipWaiting()),
  )
})

/**
 * Удаляет из ASSETS_CACHE записи, на которые нет ссылок в текущем /index.html.
 * Не даёт кэшу бесконечно расти между релизами (старые хэши вычищаются).
 */
async function pruneAssets() {
  try {
    const indexRes = await fetch('/index.html')
    if (!indexRes.ok) return
    const html = await indexRes.text()
    const refs = new Set()
    const re = /(?:href|src)="(\/assets\/[^"]+)"/g
    let m
    while ((m = re.exec(html))) refs.add(m[1])
    const cache = await caches.open(ASSETS_CACHE)
    const keys = await cache.keys()
    await Promise.all(
      keys
        .filter((req) => {
          const p = new URL(req.url).pathname
          return isHashedAsset(p) && !refs.has(p)
        })
        .map((req) => cache.delete(req)),
    )
  } catch {
    // офлайн во время активации — старые ассеты оставляем до следующего раза
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSETS_CACHE])
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      await pruneAssets()
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname

  // Навигация между страницами SPA: свежий HTML с сети, офлайн — из кэша
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // Хэшированные ассеты сборки: cache-first
  if (isHashedAsset(path)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(ASSETS_CACHE).then((c) => c.put(req, copy)).catch(() => {})
            }
            return res
          }),
      ),
    )
    return
  }

  // Статические файлы PWA (manifest, иконки): cache-first
  if (path === '/manifest.webmanifest' || path === '/icons/icon.svg' || path === '/favicon.ico') {
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req)))
    return
  }

  // Всё остальное (в т.ч. /api/*) — обычная сеть без кэширования
})
