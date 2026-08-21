/**
 * Предпросмотр сгенерированного PDF: страницы рисуются на canvas через pdf.js
 * и стопкуются в контейнер. pdf.js и его модули подгружаются лениво (только при
 * первом рендере предпросмотра), чтобы не тянуть их в основной чанк.
 *
 * Используется pdfjs-dist v4 (закреплён точной версией): v5+ требует
 * Map.prototype.getOrInsertComputed (ES2025), которого нет в старых браузерах.
 *
 * Рендер выполняется БЕЗ воркера (fake worker pdf.js — на главном потоке):
 * отдельный Worker имеет собственную глобальную область видимости, куда не
 * действуют наши полифилы, и при отсутствии в браузере современных API воркер
 * падает с uncaught-исключением — loadingTask.promise не резолвится, и
 * предпросмотр висит вечно («Готовим предпросмотр…»). На главном потоке все
 * полифилы работают, поэтому рендер гарантированно выполняется.
 */

/** Таймаут на весь рендер предпросмотра — защита от «вечного» спиннера */
const RENDER_TIMEOUT_MS = 20000

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
let workerReady = false

/**
 * Полифил Promise.withResolvers для браузеров, где pdf.js v4 его ещё не
 * встречает (Chrome <119, Firefox <121). No-op, если метод уже есть.
 */
function ensurePromiseWithResolvers() {
  const P = Promise as unknown as {
    withResolvers?: <T>() => { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (e?: unknown) => void }
  }
  if (!P.withResolvers) {
    P.withResolvers = <T>() => {
      let resolve!: (v: T | PromiseLike<T>) => void
      let reject!: (e?: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }
  }
}

/**
 * Лениво подгружает pdf.js и включает main-thread-рендер (fake worker):
 * импорт модуля воркера на главном потоке выставляет globalThis.pdfjsWorker,
 * после чего PDFWorker._initialize() идёт по пути _setupFakeWorker() и Worker
 * вообще не создаётся.
 */
function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    ensurePromiseWithResolvers()
    pdfjsPromise = (async () => {
      const mod = await import('pdfjs-dist')
      try {
        const g = globalThis as { pdfjsWorker?: unknown }
        if (!g.pdfjsWorker) {
          // Модуль воркера (webpack-сборка) при импорте в main-thread сам
          // выполняет: __webpack_exports__ = globalThis.pdfjsWorker = {...}
          await import('pdfjs-dist/build/pdf.worker.min.mjs')
        }
      } catch {
        // Не удалось подключить fake worker — остаёмся на обычном воркере
      }
      if (!workerReady) {
        const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        mod.GlobalWorkerOptions.workerSrc = workerUrl
        workerReady = true
      }
      return mod
    })()
  }
  return pdfjsPromise
}

export interface PdfPreviewHandle {
  /** Количество страниц в документе */
  pageCount: number
  /** Очищает контейнер и освобождает документ */
  destroy: () => void
}

/**
 * Предзагружает pdf.js + воркер-модуль (fake worker) заранее, чтобы первый
 * рендер предпросмотра не ждал загрузки тяжёлых чанков (~1.6 МБ). Идемпотентно:
 * повторные вызовы возвращают тот же промис (модульный кэш).
 */
export function preloadPdfPreview(): Promise<unknown> {
  return loadPdfjs()
}

/**
 * Рендерит все страницы PDF в контейнер (canvas + номер страницы, вписано по
 * ширине контейнера). Возвращает handle для очистки. При ошибке контейнер
 * очищается и исключение пробрасывается наверх. Весь рендер ограничен
 * таймаутом — предпросмотр не может «зависнуть» (вечный спиннер).
 */
export async function renderPdfPreview(bytes: Uint8Array, container: HTMLElement): Promise<PdfPreviewHandle> {
  const pdfjs = await loadPdfjs()
  container.innerHTML = ''

  // Копия байтов: pdf.js забирает TypedArray себе (transfer)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const loadingTask = pdfjs.getDocument({ data: copy })
  const destroyed = { value: false }

  /** Обещает с таймаутом: по истечении уничтожаем задачу и отклоняем */
  const withTimeout = <T>(p: Promise<T>, ms: number, msg: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = window.setTimeout(() => {
        void loadingTask.destroy()
        reject(new Error(msg))
      }, ms)
      p.then(
        (v) => {
          window.clearTimeout(t)
          resolve(v)
        },
        (e) => {
          window.clearTimeout(t)
          reject(e)
        },
      )
    })

  const run = async (): Promise<PdfPreviewHandle> => {
    const doc = await withTimeout(loadingTask.promise, RENDER_TIMEOUT_MS, 'Не удалось открыть документ для предпросмотра (таймаут)')
    const pageCount = doc.numPages
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const targetW = Math.max((container.clientWidth || 560) - 16, 220)

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(targetW / base.width, 1.25) * dpr
      const viewport = page.getViewport({ scale })

      const wrap = document.createElement('div')
      wrap.className = 'pe-page'
      const canvas = document.createElement('canvas')
      canvas.className = 'pe-page-canvas'
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      canvas.style.width = `${(canvas.width / dpr).toFixed(1)}px`
      canvas.style.height = `${(canvas.height / dpr).toFixed(1)}px`
      wrap.appendChild(canvas)
      if (pageCount > 1) {
        const num = document.createElement('span')
        num.className = 'pe-page-num'
        num.textContent = String(i)
        wrap.appendChild(num)
      }
      container.appendChild(wrap)

      const ctx = canvas.getContext('2d')
      if (ctx) await page.render({ canvasContext: ctx, viewport }).promise
      page.cleanup()
    }

    return {
      pageCount,
      destroy: () => {
        if (destroyed.value) return
        destroyed.value = true
        void loadingTask.destroy()
        container.innerHTML = ''
      },
    }
  }

  try {
    return await withTimeout(run(), RENDER_TIMEOUT_MS, 'Не удалось отрисовать предпросмотр (таймаут)')
  } catch (e) {
    void loadingTask.destroy()
    container.innerHTML = ''
    throw e
  }
}
