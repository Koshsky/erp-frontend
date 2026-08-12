<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { preloadPdfPreview, renderPdfPreview } from './previewPdf'
import type { PdfPreviewHandle } from './previewPdf'
import type { PdfExportProps } from './types'
import { fmtDate, toDate } from '../calendar'

const props = withDefaults(defineProps<PdfExportProps>(), {
  groups: () => [],
  origin: '',
  unit: 'day',
  pageTitle: 'Диаграмма задач',
  ownerId: null,
  role: null,
  scope: 'tasks',
  rowHeight: null,
  periodFrom: '',
  periodTo: '',
  scale: 1,
  resources: () => [],
  calendar: () => [],
})

/** Мин/макс даты по данным — фолбэк периода, если видимое окно страницы ещё не пришло */
const dataRange = computed(() => {
  let min = ''
  let max = ''
  const touch = (d?: string | null) => {
    if (!d) return
    if (!min || d < min) min = d
    if (!max || d > max) max = d
  }
  for (const g of props.groups ?? []) {
    touch(g.start_date)
    touch(g.end_date)
    for (const r of g.rows ?? []) {
      touch(r.start_date)
      touch(r.end_date)
    }
    for (const m of g.milestones ?? []) touch(m.date)
  }
  const now = fmtDate(new Date())
  if (!min) min = now
  if (!max) max = now
  return { from: min, to: max }
})

/** Период печати: видимое окно страницы; фолбэк — диапазон данных */
function resolvePeriod(): { from: string; to: string } {
  const { periodFrom, periodTo } = props
  if (periodFrom && periodTo && periodFrom <= periodTo) {
    return { from: periodFrom, to: periodTo }
  }
  return dataRange.value
}

/** Период пришёл с видимого окна страницы (а не фолбэк по данным) */
const periodFromPage = computed(
  () => Boolean(props.periodFrom && props.periodTo && props.periodFrom <= props.periodTo),
)

/** Читаемая строка периода для модалки (дд.мм.гггг — дд.мм.гггг) */
const periodLabel = computed(() => {
  const p = resolvePeriod()
  return `${toDate(p.from).toLocaleDateString('ru')} — ${toDate(p.to).toLocaleDateString('ru')}`
})

/** Фолбэк-подсказка: период со страницы не определён, но данные для печати есть */
const periodFallbackHint = computed(
  () => open.value && !previewLoading.value && !periodFromPage.value && visibleGroups.value.length > 0,
)

/**
 * Настройки печати: фильтры процессов и внешний вид; персистентны в сессии.
 * Период приходит со страницы (пропсы periodFrom/periodTo).
 */
const settings = ref({
  onlyMine: false,
  hiddenProjects: [] as number[],
  selectedNames: [] as string[],
  showMilestones: true,
  showTodayLine: true,
  showResources: true,
  style: 'color' as 'color' | 'mono',
  // Толщина бара (px): строка автоматически = бар + 2px; старт от пропа rowHeight
  barThickness: (props.rowHeight ?? 26) - 2,
})

/** Раскрытость списков фильтров (UI-состояние) */
const projectsOpen = ref(false)
const namesOpen = ref(false)

/** Уникальные проекты из групп/строк (для фильтра «Скрыть проекты») */
const projects = computed(() => {
  const seen = new Map<number, string>()
  const add = (id?: number, code?: string) => {
    if (id == null) return
    if (!seen.has(id)) seen.set(id, code || `Проект ${id}`)
  }
  for (const g of props.groups ?? []) {
    add(g.project_id, g.code)
    for (const r of g.rows ?? []) add(r.project_id, r.title)
  }
  return [...seen.entries()].map(([id, code]) => ({ id, code })).sort((a, b) => a.code.localeCompare(b.code, 'ru'))
})

/** Подпись фильтра имён: одинаковый для задач и процессов */
const nameFilterLabel = 'Процессы'

/** Скоуп-зависимая конфигурация модалки печати */
const showNameFilter = computed(() => props.scope !== 'projects')
const showMilestonesOption = computed(() => props.scope === 'tasks')
const showResourcesOption = computed(() => props.scope === 'tasks')
/** Уровень фильтрации имён/проекта: задачи — группы, процессы/проекты — строки */
const filterLevel = computed<'group' | 'row'>(() => (props.scope === 'tasks' ? 'group' : 'row'))

/** Варианты фильтра имён: названия групп (задачи) или строк (процессы/проекты) */
const nameOptions = computed(() => {
  const names = new Set<string>()
  if (filterLevel.value === 'row') {
    for (const g of props.groups ?? []) for (const r of g.rows ?? []) if (r.title) names.add(r.title)
  } else {
    for (const g of props.groups ?? []) if (g.title) names.add(g.title)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
})

/**
 * Группы, попадающие в печать: фильтры применяются по цепочке.
 * Уровень фильтрации («группы» для задач, «строки» для процессов/проектов)
 * выводится из скоупа.
 */
const visibleGroups = computed(() => {
  let list = props.groups ?? []
  const level = filterLevel.value
  // «Только мои процессы» (виден только vp): по владельцу группы или строки
  if (settings.value.onlyMine && props.ownerId != null) {
    if (level === 'group') {
      list = list.filter((g) => g.owner_id === props.ownerId)
    } else {
      list = list
        .map((g) => ({ ...g, rows: (g.rows ?? []).filter((r) => r.owner_id === props.ownerId) }))
        .filter((g) => (g.rows?.length ?? 0) > 0)
    }
  }
  // «Скрыть проекты»: убираем группы проекта и строки проекта
  if (settings.value.hiddenProjects.length) {
    const hidden = new Set(settings.value.hiddenProjects)
    list = list.filter((g) => g.project_id == null || !hidden.has(g.project_id))
    if (level === 'row') {
      list = list.map((g) => ({
        ...g,
        rows: (g.rows ?? []).filter((r) => r.project_id == null || !hidden.has(r.project_id)),
      }))
    }
  }
  // Фильтр по названиям (мультивыбор): группы или строки (кроме скоупа проектов)
  if (showNameFilter.value && settings.value.selectedNames.length) {
    const sel = new Set(settings.value.selectedNames)
    if (level === 'group') {
      list = list.filter((g) => sel.has(g.title))
    } else {
      list = list
        .map((g) => ({ ...g, rows: (g.rows ?? []).filter((r) => sel.has(r.title)) }))
        .filter((g) => (g.rows?.length ?? 0) > 0)
    }
  }
  return list
})

/** Отфильтровано всё — предпросмотр пуст, печать недоступна */
const previewEmpty = computed(
  () => !previewLoading.value && !previewError.value && visibleGroups.value.length === 0,
)

const open = ref(false)
const busy = ref(false)
const previewError = ref<string | null>(null)
const previewLoading = ref(false)
const pageCount = ref(0)
const currentBytes = ref<Uint8Array | null>(null)

const filename = computed(() => `gantt-${fmtDate(new Date())}.pdf`)

const previewEl = ref<HTMLElement | null>(null)
let previewHandle: PdfPreviewHandle | null = null

/** Параметры последнего успешного рендера (чтобы не перегенерировать зря) */
let renderedParams = ''
let genToken = 0
let genTimer: ReturnType<typeof setTimeout> | null = null

/** Ключ текущего рендера: фильтры + период/ширина со страницы */
function renderKey(): string {
  const p = resolvePeriod()
  return JSON.stringify({ ...settings.value, from: p.from, to: p.to })
}

/**
 * Тёплая загрузка тяжёлых модулей предпросмотра (pdfRenderer + pdf.js/воркер,
 * ~2.8 МБ): запускается по первому клику и грузит чанки ПАРАЛЛЕЛЬНО, чтобы
 * первое открытие не ждало последовательную загрузку каждого чанка.
 * Идемпотентно: повторные вызовы возвращают тот же промис.
 */
let warmupPromise: Promise<unknown> | null = null
function warmup(): Promise<unknown> {
  if (!warmupPromise) {
    const p = Promise.all([import('./pdfRenderer'), preloadPdfPreview()])
    // Не даём отклониться «незахваченной» ошибке до того, как её заберёт generate()
    p.catch(() => {})
    warmupPromise = p
  }
  return warmupPromise
}

/**
 * Генерация предпросмотра: один генератор в полёте (single-flight).
 * Повторные вызовы generate() во время работы не начинают новый рендер,
 * а ставят флаг «переделать» — после завершения текущего рендера он
 * выполняется ещё раз с актуальными настройками. Это исключает гонки
 * токенов (когда отложенный вызов инвалидировал свежий предпросмотр и
 * оставлял застрявшую заглушку «Готовим предпросмотр…»).
 */
let runInProgress = false
let runPending = false
let runPromise: Promise<void> | null = null

function generate(force = false): Promise<void> {
  if (runInProgress) {
    runPending = true
    return runPromise ?? Promise.resolve()
  }
  const p = runAll(force)
  runPromise = p
  return p
}

async function runAll(force: boolean) {
  runInProgress = true
  try {
    do {
      runPending = false
      await generateOnce(force)
      force = false
    } while (runPending && open.value)
  } finally {
    runInProgress = false
    runPromise = null
    previewLoading.value = false
  }
}

/** Один прогон: фильтры → pdf-lib → рендер страниц предпросмотра */
async function generateOnce(force: boolean) {
  const params = renderKey()
  // Параметры не менялись — рендер не нужен. Ранний выход БЕЗ смены токена:
  // текущий рендер (если идёт) должен спокойно завершиться.
  if (!force && params === renderedParams && currentBytes.value) return
  // Все данные отфильтрованы — предпросмотр пуст, печать недоступна
  if (visibleGroups.value.length === 0) {
    previewError.value = null
    pageCount.value = 0
    currentBytes.value = null
    return
  }
  previewLoading.value = true
  previewError.value = null
  const token = ++genToken
  try {
    // Модули грузятся параллельно (по первому клику — warmup); повторные
    // вызовы застают их в кэше и не ждут загрузки.
    await warmup()
    const { renderGanttPdf } = await import('./pdfRenderer')
    const period = resolvePeriod()
    const bytes = await renderGanttPdf(visibleGroups.value, {
      from: period.from,
      to: period.to,
      origin: props.origin,
      unit: props.unit,
      pageTitle: props.pageTitle,
      // Вехи и занятость ресурсов — только для скоупа задач
      showMilestones: showMilestonesOption.value ? settings.value.showMilestones : false,
      showTodayLine: settings.value.showTodayLine,
      style: settings.value.style,
      scale: Number(props.scale) || 1,
      // Строка = бар + 2px: рендерер вычислит бар = rowHeight − 2 = barThickness
      rowHeight: settings.value.barThickness + 2,
      resources: showResourcesOption.value && settings.value.showResources
        ? (props.resources ?? [])
            .filter((r) => r.id != null)
            .map((r) => {
              const cal = (props.calendar ?? []).find((c) => c.resource_id === r.id)
              return {
                id: r.id as number,
                code: r.code ?? '',
                title: r.title,
                periods: (cal?.periods ?? [])
                  .filter((p) => p.start_date && p.end_date)
                  .map((p) => ({
                    start_date: p.start_date as string,
                    end_date: p.end_date as string,
                    available: p.available ?? 0,
                  })),
              }
            })
        : [],
    })
    if (token !== genToken) return
    currentBytes.value = bytes
    renderedParams = params

    const el = previewEl.value
    if (el) {
      previewHandle?.destroy()
      previewHandle = null
      const handle = await renderPdfPreview(bytes, el)
      if (token !== genToken) {
        handle.destroy()
        return
      }
      previewHandle = handle
      pageCount.value = handle.pageCount
    }
  } catch (e: any) {
    if (token === genToken) {
      previewError.value = e?.message || String(e)
      pageCount.value = 0
      currentBytes.value = null
    }
  }
}

/** Живое обновление предпросмотра (дебаунс) при изменении настроек */
function scheduleGenerate() {
  if (genTimer != null) clearTimeout(genTimer)
  genTimer = setTimeout(() => {
    genTimer = null
    void generate()
  }, 400)
}

watch(settings, scheduleGenerate, { deep: true })

/**
 * Период/ширина со страницы приходят с дебаунсом (эмит visible-range ~150 мс):
 * если модалка открыта сразу после прокрутки, генерация на открытии могла уйти
 * со старыми значениями — перегенерируем предпросмотр, когда пропсы «доехали».
 */
watch(
  () => [props.periodFrom, props.periodTo] as const,
  () => {
    if (open.value) scheduleGenerate()
  },
)

function openDialog() {
  if (busy.value) return
  // Фильтры процессов персистентны в сессии; период и ширина — со страницы.
  renderedParams = ''
  previewError.value = null
  pageCount.value = 0
  currentBytes.value = null
  open.value = true
  void nextTick(() => void generate(true))
}

function closeDialog() {
  if (busy.value) return
  open.value = false
  runPending = false
  genToken++
  if (genTimer != null) {
    clearTimeout(genTimer)
    genTimer = null
  }
  previewHandle?.destroy()
  previewHandle = null
  previewLoading.value = false
  previewError.value = null
}

function download(bytes: Uint8Array, name: string) {
  // Копия в отдельный ArrayBuffer: TS не позволяет Blob-часть из Uint8Array<ArrayBufferLike>
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy.buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Скачивает файл, соответствующий текущему предпросмотру (без повторной генерации) */
async function onDownload() {
  if (busy.value || previewEmpty.value) return
  const params = renderKey()
  let bytes = currentBytes.value
  if (!bytes || params !== renderedParams) {
    busy.value = true
    try {
      await generate(true)
      bytes = currentBytes.value
    } finally {
      busy.value = false
    }
  }
  if (!bytes) return
  download(bytes, filename.value)
  closeDialog()
}

/** Печатает PDF через браузерный диалог: скрытый iframe с blob-URL + contentWindow.print() */
function printBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy.buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  iframe.src = url
  document.body.appendChild(iframe)
  const cleanup = () => {
    URL.revokeObjectURL(url)
    iframe.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  iframe.addEventListener('load', () => {
    // Даём встроенному просмотрщику PDF время открыть документ, затем вызываем печать
    setTimeout(() => {
      try {
        iframe.contentWindow?.print()
      } catch {
        cleanup()
      }
    }, 150)
  })
}

/** Подготовка к печати: генерирует PDF и отправляет его в браузерный диалог печати */
async function onPrint() {
  if (busy.value || previewEmpty.value) return
  const params = renderKey()
  let bytes = currentBytes.value
  if (!bytes || params !== renderedParams) {
    busy.value = true
    try {
      await generate(true)
      bytes = currentBytes.value
    } finally {
      busy.value = false
    }
  }
  if (!bytes) return
  printBytes(bytes)
  closeDialog()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) closeDialog()
}

/** Глобальный Ctrl/Cmd+P/S (перехвачен в MainLayout) — открыть модалку подготовки к печати */
function onPrintRequest() {
  if (!open.value) openDialog()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('app:print-request', onPrintRequest)
})

onBeforeUnmount(() => {
  if (genTimer != null) clearTimeout(genTimer)
  previewHandle?.destroy()
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('app:print-request', onPrintRequest)
})
</script>

<template>
  <div class="pe">
    <Teleport to="body">
      <div v-if="open" class="pe-overlay" @mousedown.self="closeDialog">
        <div class="pe-modal" role="dialog" aria-modal="true" aria-label="Печать диаграммы в PDF">
          <div class="pe-head">
            <h3 class="pe-title">Печать диаграммы в PDF</h3>
            <button type="button" class="pe-close" aria-label="Закрыть" @click="closeDialog">×</button>
          </div>

          <div class="pe-body">
            <div class="pe-settings">
              <div class="pe-field">
                <span class="pe-label">Стиль диаграммы</span>
                <div class="pe-style-row">
                  <label class="pe-style-opt">
                    <input v-model="settings.style" type="radio" name="pe-style" value="color" class="pe-checkbox" />
                    Цветной
                  </label>
                  <label class="pe-style-opt">
                    <input v-model="settings.style" type="radio" name="pe-style" value="mono" class="pe-checkbox" />
                    Чёрно-белый (контурный)
                  </label>
                </div>
              </div>

              <div class="pe-field">
                <span class="pe-label">Толщина баров</span>
                <div class="pe-range-row">
                  <input v-model.number="settings.barThickness" type="range" min="16" max="64" step="4" class="pe-range" />
                  <span class="pe-range-value">{{ settings.barThickness }}px</span>
                </div>
              </div>

              <label v-if="role === 'vp'" class="pe-field">
                <span class="pe-toggle">
                  <input v-model="settings.onlyMine" type="checkbox" class="pe-checkbox" />
                  <span class="pe-label">Только мои процессы</span>
                </span>
                <span class="pe-hint">Скрыть из печати процессы других владельцев</span>
              </label>

              <label v-if="showMilestonesOption" class="pe-field">
                <span class="pe-toggle">
                  <input v-model="settings.showMilestones" type="checkbox" class="pe-checkbox" />
                  <span class="pe-label">Показывать вехи</span>
                </span>
              </label>

              <label class="pe-field">
                <span class="pe-toggle">
                  <input v-model="settings.showTodayLine" type="checkbox" class="pe-checkbox" />
                  <span class="pe-label">Показывать линию «сегодня»</span>
                </span>
                <span class="pe-hint">Вертикальная линия текущей даты на диаграмме</span>
              </label>

              <label v-if="showResourcesOption" class="pe-field">
                <span class="pe-toggle">
                  <input v-model="settings.showResources" type="checkbox" class="pe-checkbox" />
                  <span class="pe-label">Показывать занятость ресурсов</span>
                </span>
              </label>

              <div v-if="showNameFilter" class="pe-field">
                <button type="button" class="pe-filters-toggle" @click="namesOpen = !namesOpen">
                  <span>{{ nameFilterLabel }}</span>
                  <span v-if="settings.selectedNames.length" class="pe-filters-count">{{ settings.selectedNames.length }}</span>
                  <span class="pe-caret">{{ namesOpen ? '▾' : '▸' }}</span>
                </button>
                <div v-if="namesOpen" class="pe-filter-list">
                  <p v-if="!nameOptions.length" class="pe-hint">Нет данных</p>
                  <label v-for="name in nameOptions" :key="name" class="pe-filter-item">
                    <input v-model="settings.selectedNames" type="checkbox" :value="name" class="pe-checkbox" />
                    <span class="pe-filter-label">{{ name }}</span>
                  </label>
                </div>
              </div>

              <div class="pe-field">
                <button type="button" class="pe-filters-toggle" @click="projectsOpen = !projectsOpen">
                  <span>Скрыть проекты</span>
                  <span v-if="settings.hiddenProjects.length" class="pe-filters-count">{{ settings.hiddenProjects.length }}</span>
                  <span class="pe-caret">{{ projectsOpen ? '▾' : '▸' }}</span>
                </button>
                <div v-if="projectsOpen" class="pe-filter-list">
                  <p v-if="!projects.length" class="pe-hint">Нет проектов</p>
                  <label v-for="pr in projects" :key="pr.id" class="pe-filter-item">
                    <input v-model="settings.hiddenProjects" type="checkbox" :value="pr.id" class="pe-checkbox" />
                    <span class="pe-filter-label">{{ pr.code }}</span>
                  </label>
                </div>
              </div>

              <div class="pe-file">
                <span class="pe-file-label">Период печати</span>
                <span class="pe-file-name">{{ periodLabel }}</span>
                <span v-if="!periodFromPage" class="pe-hint">Период определён по данным — уточните вид страницы</span>
              </div>

              <div class="pe-file">
                <span class="pe-file-label">Файл</span>
                <span class="pe-file-name">{{ filename }}</span>
              </div>
            </div>

            <div class="pe-preview-area">
              <div v-if="periodFallbackHint" class="pe-period-hint">
                Период со страницы не определён — используется диапазон данных. Измените вид страницы и откройте заново.
              </div>
              <div class="pe-preview-head">
                <span class="pe-pages-count">Страниц: {{ pageCount }}</span>
                <span v-if="previewLoading" class="pe-updating">Обновляем…</span>
              </div>
              <div class="pe-preview-box">
                <div ref="previewEl" class="pe-pages"></div>
                <div v-if="previewLoading" class="pe-msg"><span class="pe-spinner" /> Готовим предпросмотр…</div>
                <div v-else-if="previewError" class="pe-msg pe-msg-error">{{ previewError }}</div>
                <div v-else-if="previewEmpty" class="pe-msg">Нет данных для печати — измените фильтры</div>
              </div>
            </div>
          </div>

          <div class="pe-actions">
            <button type="button" class="pe-btn-cancel" @click="closeDialog">Отмена</button>
            <button type="button" class="pe-btn-download" :disabled="busy || previewEmpty" @click="onDownload">
              Скачать PDF
            </button>
            <button type="button" class="pe-btn-primary" :disabled="busy || previewEmpty" @click="onPrint">
              <span v-if="busy" class="pe-spinner" />
              Печать
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.pe-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  color: #fff;
  background: #1a73e8;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}
.pe-btn:hover:not(:disabled) {
  background: #1765cc;
}
.pe-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* === Модалка === */
.pe-overlay {
  position: fixed;
  inset: 0;
  z-index: 40000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
}
.pe-modal {
  width: 100%;
  max-width: 1000px;
  max-height: 92vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pe-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e8e8e8;
}
.pe-title {
  font-size: 16px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0;
}
.pe-close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.pe-close:hover {
  background: #f2f2f2;
  color: #333;
}

.pe-body {
  display: flex;
  gap: 16px;
  padding: 16px;
  min-height: 0;
  flex: 1;
}

/* === Настройки === */
.pe-settings {
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  min-height: 0;
}
.pe-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pe-label {
  font-size: 13px;
  color: #444;
  font-weight: 500;
}
.pe-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pe-input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.pe-hint {
  font-size: 11px;
  color: #999;
}
.pe-style-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.pe-style-opt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
}
.pe-range-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pe-range {
  flex: 1;
  accent-color: #1a73e8;
}
.pe-range-value {
  font-size: 12px;
  color: #555;
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.pe-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.pe-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #1a73e8;
  cursor: pointer;
  flex-shrink: 0;
}

/* === Фильтры процессов === */
.pe-filters-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: 1px solid #e3e6ea;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: #333;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.pe-filters-toggle:hover {
  background: #eef2f7;
  border-color: #cfd6de;
}
.pe-filters-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #1a73e8;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pe-caret {
  margin-left: auto;
  color: #888;
  font-size: 11px;
}
.pe-filter-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 6px;
  max-height: 180px;
  overflow-y: auto;
  background: #fff;
}
.pe-filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.pe-filter-item:hover {
  background: #f2f6fc;
}
.pe-filter-label {
  font-size: 12px;
  color: #333;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pe-file {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 14px;
  border-top: 1px solid #f0f0f0;
}
.pe-file-label {
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.pe-file-name {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  word-break: break-all;
}
.pe-file-sub {
  font-size: 12px;
  color: #666;
}
.pe-period-hint {
  padding: 8px 12px;
  font-size: 12px;
  color: #b45309;
  background: #fef3c7;
  border-bottom: 1px solid #fde68a;
}

/* === Предпросмотр === */
.pe-preview-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  overflow: hidden;
  background: #f4f6f9;
}
.pe-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #e8e8e8;
  background: #fff;
  font-size: 12px;
  color: #666;
}
.pe-updating {
  color: #1a73e8;
}
.pe-preview-box {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}
.pe-pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.pe-msg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #666;
  font-size: 13px;
  background: #f4f6f9;
}
.pe-msg-error {
  color: #d93025;
}
.pe-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(26, 115, 232, 0.25);
  border-top-color: #1a73e8;
  border-radius: 50%;
  animation: pe-spin 0.7s linear infinite;
  display: inline-block;
  flex-shrink: 0;
}
@keyframes pe-spin {
  to {
    transform: rotate(360deg);
  }
}

/* === Действия === */
.pe-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid #e8e8e8;
}
.pe-btn-cancel,
.pe-btn-primary {
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.pe-btn-cancel {
  background: #f2f2f2;
  color: #444;
}
.pe-btn-cancel:hover {
  background: #e6e6e6;
}
.pe-btn-primary {
  background: #1a73e8;
  color: #fff;
}
.pe-btn-download {
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #e8f0fe;
  color: #1a73e8;
}
.pe-btn-download:hover:not(:disabled) {
  background: #d2e3fc;
}
.pe-btn-download:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.pe-btn-primary:hover:not(:disabled) {
  background: #1765cc;
}
.pe-btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>

<!-- Страницы предпросмотра создаются скриптом вне Vue — стили не скрываются под scoped -->
<style>
.pe-page {
  position: relative;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}
.pe-page-canvas {
  display: block;
  border-radius: 4px;
}
.pe-page-num {
  position: absolute;
  top: -9px;
  right: 8px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #1a73e8;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
</style>
