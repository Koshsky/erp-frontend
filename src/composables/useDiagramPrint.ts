import { nextTick, reactive } from 'vue'
import type { PlanningUnit } from '../components/planner/calendar'

export type PrintOrientation = 'portrait' | 'landscape'
export type PrintMode = 'print' | 'save'

/** Печатная ширина содержимого (px, 96dpi) для A4 с полями 10мм. */
const PRINT_LANDSCAPE_W = 1042
const PRINT_PORTRAIT_W = 736

export interface DiagramPrintTarget {
  /** Переключает масштаб диаграммы (День/Декада) для печати. */
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

function open(mode: PrintMode) {
  if (!target) return
  state.unit = target.getUnit()
  state.mode = mode
  state.open = true
}

function close() {
  state.open = false
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
  const content = target?.content()
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
    }
  `
  document.head.appendChild(style)
}

async function run() {
  if (!target) return
  state.open = false
  const content = target.content()
  if (!content) return

  prevUnit = target.getUnit()
  if (state.unit !== prevUnit) {
    target.setUnit(state.unit)
    await nextTick()
  }

  const width = content.scrollWidth || content.offsetWidth
  const height = content.scrollHeight || content.offsetHeight
  const pageW = pageWidth()
  const fitScale = width > 0 ? pageW / width : 1
  const scale = fitScale * (state.scale / 100)

  if (width * scale <= pageW + 1) {
    applySinglePage(content, scale, height)
  } else {
    applySlices(content, scale, height, pageW)
  }

  injectPrintStyle()
  const done = () => cleanup()
  window.addEventListener('afterprint', done, { once: true })
  window.print()
  cleanupTimer = window.setTimeout(done, 1500)
}

/** Перехват Ctrl+P / Ctrl+S на диаграммах: открывает диалог печати. */
function onKeydown(e: KeyboardEvent) {
  if (!target) return
  if (!(e.ctrlKey || e.metaKey)) return
  const key = e.key.toLowerCase()
  if (key === 'p') {
    e.preventDefault()
    open('print')
    return
  }
  if (key === 's') {
    e.preventDefault()
    open('save')
  }
}

export function useDiagramPrint() {
  return { state, registerDiagram, open, close, run, onKeydown }
}
