import { nextTick, reactive } from 'vue'
import type { PlanningUnit } from '../components/planner/calendar'

export type PrintOrientation = 'portrait' | 'landscape'
export type PrintMode = 'print' | 'save'

/** Печатная ширина содержимого (px, 96dpi) для A4 с полями 10мм. */
const PRINT_LANDSCAPE_W = 1042
const PRINT_PORTRAIT_W = 736

export interface DiagramPrintTarget {
  /** Переключает масштаб диаграммы (День/Декада). */
  setUnit: (u: PlanningUnit) => void
  getUnit: () => PlanningUnit
  /** Возвращает элемент диаграммы (.tg-content) текущей страницы. */
  content: () => HTMLElement | null
}

export interface DiagramPrintState {
  open: boolean
  mode: PrintMode
  unit: PlanningUnit
  /** Масштаб в процентах относительно «вписать по ширине» (100 = вся диаграмма на лист). */
  scale: number
  orientation: PrintOrientation
}

export interface PrintPageLayout {
  pageW: number
  scale: number
  slices: number
  contentWidth: number
  contentHeight: number
}

const state = reactive<DiagramPrintState>({
  open: false,
  mode: 'print',
  unit: 'day',
  scale: 100,
  orientation: 'landscape',
})

let target: DiagramPrintTarget | null = null
let prevUnit: PlanningUnit | null = null
let cleanupTimer: number | null = null

function pageWidth(): number {
  return state.orientation === 'landscape' ? PRINT_LANDSCAPE_W : PRINT_PORTRAIT_W
}

function registerDiagram(t: DiagramPrintTarget | null) {
  target = t
  if (t) state.unit = t.getUnit()
}

function getContent(): HTMLElement | null {
  return target?.content() ?? null
}

/** Расчёт печатной раскладки: одна страница (вписано) или разбивка на полосы. */
function buildPages(): PrintPageLayout | null {
  const content = getContent()
  if (!content) return null
  const width = content.scrollWidth || content.offsetWidth
  const height = content.scrollHeight || content.offsetHeight
  const pageW = pageWidth()
  const fitScale = width > 0 ? pageW / width : 1
  const scale = fitScale * (state.scale / 100)
  const slices = width * scale <= pageW + 1 ? 1 : Math.ceil((width * scale) / pageW)
  return { pageW, scale, slices, contentWidth: width, contentHeight: height }
}

/** Применяет выбранный масштаб шкалы к живой диаграмме (чтобы preview отражал выбор). */
function applyUnit(u: PlanningUnit) {
  if (state.unit !== u) state.unit = u
  target?.setUnit(u)
}

function open(mode: PrintMode) {
  if (!target) return
  prevUnit = target.getUnit()
  state.unit = prevUnit
  state.mode = mode
  state.open = true
}

function close() {
  state.open = false
  if (target && prevUnit != null) {
    target.setUnit(prevUnit)
    prevUnit = null
  }
}

function clearContentStyles(content: HTMLElement) {
  content.style.transform = ''
  content.style.transformOrigin = ''
  content.style.height = ''
  content.style.width = ''
  content.style.overflow = ''
  content.style.display = ''
  content.style.position = ''
  content.style.left = ''
  content.style.top = ''
}

function cleanup() {
  if (cleanupTimer != null) {
    clearTimeout(cleanupTimer)
    cleanupTimer = null
  }
  document.getElementById('diagram-print-slices')?.remove()
  document.getElementById('diagram-print-style')?.remove()
  const content = getContent()
  if (content) clearContentStyles(content)
  if (target && prevUnit != null) {
    target.setUnit(prevUnit)
    prevUnit = null
  }
}

/** Печать одной страницы: вся диаграмма масштабируется под ширину листа. */
function applySinglePage(content: HTMLElement, scale: number, height: number) {
  content.style.transform = `scale(${scale})`
  content.style.transformOrigin = 'top left'
  content.style.height = `${height * scale}px`
  content.style.overflow = 'hidden'
}

/** Печать по страницам: широкая диаграмма режется на горизонтальные полосы. */
function applySlices(content: HTMLElement, scale: number, height: number, pageW: number) {
  const width = content.scrollWidth || content.offsetWidth
  const slices = Math.ceil((width * scale) / pageW)
  const holder = document.createElement('div')
  holder.id = 'diagram-print-slices'
  for (let i = 0; i < slices; i++) {
    const slice = document.createElement('div')
    slice.className = 'print-slice'
    slice.style.width = `${pageW}px`
    slice.style.height = `${height * scale}px`
    slice.style.overflow = 'hidden'
    slice.style.position = 'relative'
    const clone = content.cloneNode(true) as HTMLElement
    clone.style.transform = `scale(${scale})`
    clone.style.transformOrigin = 'top left'
    clone.style.position = 'absolute'
    clone.style.left = `${-i * pageW}px`
    clone.style.top = '0'
    clone.style.width = `${width}px`
    clone.style.height = `${height}px`
    clone.style.overflow = 'hidden'
    slice.appendChild(clone)
    holder.appendChild(slice)
  }
  document.body.appendChild(holder)
  content.style.display = 'none'
}

function injectPrintStyle() {
  const style = document.createElement('style')
  style.id = 'diagram-print-style'
  style.textContent = `
    @media print {
      @page { size: A4 ${state.orientation}; margin: 10mm; }
      html, body { background: #fff !important; }
      .ah { display: none !important; }
      .ml-body { display: block !important; }
      .ml-main { padding: 0 !important; overflow: visible !important; }
      .pp { padding: 0 !important; }
      .tg-scroll { overflow: visible !important; }
      #diagram-print-slices { display: block; }
      .print-slice { break-after: page; break-inside: avoid; }
      .pd-overlay, .pd, .cd-overlay, .cd { display: none !important; }
    }
  `
  document.head.appendChild(style)
}

async function run() {
  if (!target) return
  state.open = false
  // Дожидаемся удаления диалога настроек из DOM, иначе нативный диалог печати
  // захватит модалку вместо диаграммы.
  await nextTick()
  const layout = buildPages()
  const content = getContent()
  if (!layout || !content) {
    cleanup()
    return
  }
  if (layout.slices === 1) {
    applySinglePage(content, layout.scale, layout.contentHeight)
  } else {
    applySlices(content, layout.scale, layout.contentHeight, layout.pageW)
  }
  injectPrintStyle()
  const done = () => cleanup()
  window.addEventListener('afterprint', done, { once: true })
  window.print()
  cleanupTimer = window.setTimeout(done, 1500)
}

/**
 * Перехват Ctrl+P / Ctrl+S на диаграммах: открывает диалог печати.
 * ВАЖНО: для буквенных клавиш используется e.code (физическая клавиша), а не
 * e.key — иначе бинды ломаются на других раскладках (ru: e.key === 'з'/'ы').
 * Будущие хоткеи-буквы добавлять только через e.code.
 */
function onKeydown(e: KeyboardEvent) {
  if (!target) return
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.code === 'KeyP') {
    e.preventDefault()
    open('print')
    return
  }
  if (e.code === 'KeyS') {
    e.preventDefault()
    open('save')
  }
}

export function useDiagramPrint() {
  return { state, registerDiagram, getContent, buildPages, applyUnit, open, close, run, onKeydown }
}
