/**
 * Service Worker для офлайн-доступа к SPA (нативная реализация, без плагинов).
 *
 * Стратегии:
 *  - навигация (HTML-документы): network-first → fallback на закэшированный /index.html;
 *  - хэшированные ассеты /assets/*: cache-first. Полный список ассетов сборки
 *    приходит из /precache-manifest.json (генерируется vite-плагином на build):
 *    при установке кэшируются ВСЕ чанки (включая lazy-чанки неоткрытых страниц),
 *    при активации по этому же списку вычищаются устаревшие;
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
const SHELL_FILES = [
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

/** Ассеты, которые уже нельзя изменить (имя содержит хэш сборки) */
function isHashedAsset(pathname) {
  return pathname.startsWith('/assets/')
}

/** Размер пачки параллельных загрузок при precache (мягко для сети) */
const PRECACHE_BATCH = 8
/** Сколько попыток на ассет (транзиентные обрывы сети) */
const PRECACHE_RETRIES = 3
/** Пауза между попытками */
const RETRY_DELAY_MS = 500

/** Ключ в SHELL_CACHE, куда пишется версия активного SW (читается из UI) */
const VERSION_KEY = '/__sw_version__'

/** Читает { assets, version } из /precache-manifest.json или null при недоступности */
async function fetchManifest() {
  try {
    const res = await fetch('/precache-manifest.json')
    if (!res.ok) return null
    const parsed = await res.json()
    if (Array.isArray(parsed)) return { assets: parsed, version: '' }
    return { assets: parsed?.assets ?? [], version: parsed?.version ?? '' }
  } catch {
    return null
  }
}

/** Догружает один ассет с ретраями. Возвращает true при успехе. */
async function addAsset(cache, url) {
  for (let attempt = 0; attempt < PRECACHE_RETRIES; attempt++) {
    try {
      await cache.add(url)
      return true
    } catch (e) {
      if (attempt === PRECACHE_RETRIES - 1) return false
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
  return false
}

/**
 * Кэширует все ассеты сборки из /precache-manifest.json (с ретраями).
 * Возвращает true, если precache полон (все ассеты манифеста в кэше),
 * false — если манифест недоступен или часть ассетов не догрузилась.
 */
async function precacheAssets() {
  const manifest = await fetchManifest()
  if (!manifest) return false
  const cache = await caches.open(ASSETS_CACHE)
  const urls = manifest.assets.filter(
    (url) => typeof url === 'string' && url.startsWith('/assets/'),
  )
  for (let i = 0; i < urls.length; i += PRECACHE_BATCH) {
    await Promise.all(
      urls.slice(i, i + PRECACHE_BATCH).map((url) => addAsset(cache, url)),
    )
  }
  if (manifest.version) {
    const shell = await caches.open(SHELL_CACHE)
    await shell.put(
      VERSION_KEY,
      new Response(manifest.version, { headers: { 'Content-Type': 'text/plain' } }),
    )
    console.log('[SW] версия:', manifest.version)
  }
  const keys = await cache.keys()
  const cached = keys.filter((r) => isHashedAsset(new URL(r.url).pathname)).length
  return cached >= urls.length
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE)
      await Promise.all(SHELL_FILES.map((file) => shell.add(file).catch(() => {})))
      await precacheAssets()
      await self.skipWaiting()
    })(),
  )
})

/**
 * Удаляет из ASSETS_CACHE записи, которых нет в текущем /precache-manifest.json.
 * Манифест — единственный источник истины: он содержит и entry-, и lazy-чанки,
 * поэтому между релизами вычищаются только по-настоящему устаревшие хэши.
 */
async function pruneAssets() {
  let list = []
  try {
    const res = await fetch('/precache-manifest.json')
    if (!res.ok) return
    const parsed = await res.json()
    if (Array.isArray(parsed)) list = parsed
    else list = parsed?.assets ?? []
  } catch {
    return // офлайн во время активации — чистим при следующем релизе
  }
  const keep = new Set(list)
  const cache = await caches.open(ASSETS_CACHE)
  const keys = await cache.keys()
  await Promise.all(
    keys
      .filter((req) => {
        const p = new URL(req.url).pathname
        return isHashedAsset(p) && !keep.has(p)
      })
      .map((req) => cache.delete(req)),
  )
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSETS_CACHE])
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      // Повторный precache: закрывает случай, когда при install манифест или
      // часть ассетов не догрузились. Устаревшие хэши чистим только когда
      // новый precache подтверждён полным — иначе оставляем их как fallback.
      const complete = await precacheAssets()
      if (complete) await pruneAssets()
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

  // Хэшированные ассеты сборки: cache-first. ignoreVary/ignoreSearch — чтобы
  // совпадение не зависело от заголовков запроса (Vary) и query-параметров.
  // При промахе и недоступной сети отдаём 503 вместо проброса NetworkError в
  // respondWith (иначе «error loading dynamically imported module»).
  if (isHashedAsset(path)) {
    event.respondWith(
      caches.match(req, { ignoreVary: true, ignoreSearch: true }).then(
        (cached) =>
          cached ||
          fetch(req)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone()
                caches.open(ASSETS_CACHE).then((c) => c.put(req, copy)).catch(() => {})
              }
              return res
            })
            .catch(() => new Response('', { status: 503, statusText: 'Offline' })),
      ),
    )
    return
  }

  // Статические файлы PWA (manifest, иконки): cache-first
  if (
    path === '/manifest.webmanifest' ||
    path === '/icons/icon.svg' ||
    path === '/icons/icon-192.png' ||
    path === '/icons/icon-512.png' ||
    path === '/favicon.ico'
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).catch(() => new Response('', { status: 503, statusText: 'Offline' })),
      ),
    )
    return
  }

  // Всё остальное (в т.ч. /api/*) — обычная сеть без кэширования
})
