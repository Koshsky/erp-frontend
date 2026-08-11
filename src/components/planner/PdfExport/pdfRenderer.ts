/**
 * Векторный рендерер диаграммы Ганта в PDF (печать на принтере).
 *
 * Чистая функция без зависимостей от Vue/DOM/сторов: на вход — модель групп
 * (процессы → задачи/вехи) и настройки печати, на выход — байты PDF.
 * Даты и ячейки считаются через calendar.ts, константы раскладки — из layout.ts,
 * чтобы печать совпадала с экранной диаграммой.
 *
 * Пагинация: A4 landscape, шкала режется по колонкам (каждая страница — свой
 * срез дат), строки — по страницам по вертикали; колонка названий и календарный
 * заголовок повторяются на каждой странице. Ширина ячейки задаётся в px экрана
 * (умножается на 0.75 → pt).
 */
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { cellIndexForDate, cellStartDate, cellEndDate, toDate, type PlanningUnit } from '../calendar'
import {
  CELL_PX_NUM_DAY,
  CELL_PX_NUM_DECADE,
  CELL_PX_WD_DAY,
  LABEL_WIDTH,
  headerHeight,
} from '../layout'
import robotoBoldUrl from '@/assets/fonts/Roboto-Bold.ttf?url'
import robotoRegularUrl from '@/assets/fonts/Roboto-Regular.ttf?url'

/** Экранный px → pt (печать в масштабе 1:1 с экранной раскладкой) */
const PT = 0.75

/** A4 landscape (pt) */
const PAGE_W = 841.89
const PAGE_H = 595.28

const MARGIN = 24
const FOOTER_H = 18

/** Ширина колонки названий в pt (180px экрана) */
const labelW = LABEL_WIDTH * PT
/** Высота строки задачи в pt (26px) */
const rowH = 26 * PT
/** Высота бара в pt (24px) */
const barH = 24 * PT
/** Полоса вех в группе в pt (20px) */
const msStripH = 20 * PT
/** Мин. высота объединённого лейбла группы в pt (64px, как на экране) */
const minGroupH = 64 * PT
/** Высоты строк шапки (px на экране 18, верхний отступ 2) */
const monthRowH = 20 * PT
const numRowH = 18 * PT
const wdRowH = 18 * PT

const BAR_COLOR = rgb(52 / 255, 168 / 255, 83 / 255) // #34a853
const MS_COLOR = rgb(251 / 255, 188 / 255, 4 / 255) // #fbbc04
const CODE_COLOR = rgb(26 / 255, 115 / 255, 232 / 255) // #1a73e8
const HEADER_BG = rgb(248 / 255, 249 / 255, 250 / 255) // #f8f9fa
const GRID_LINE = rgb(228 / 255, 230 / 255, 232 / 255) // #e4e6e8
const HEADER_LINE = rgb(230 / 255, 230 / 255, 230 / 255) // #e6e6e6
const GROUP_LINE = rgb(224 / 255, 224 / 255, 224 / 255) // #e0e0e0
const LABEL_LINE = rgb(240 / 255, 240 / 255, 240 / 255) // #f0f0f0
const TEXT_MAIN = rgb(0.2, 0.2, 0.2)
const TEXT_MID = rgb(0.333, 0.333, 0.333)
const TEXT_DIM = rgb(0.533, 0.533, 0.533)
const TEXT_FAINT = rgb(0.6, 0.6, 0.6)
const TODAY_COLOR = rgb(217 / 255, 48 / 255, 37 / 255) // #d93025
const WHITE = rgb(1, 1, 1)

export interface PdfGanttResource {
  code?: string
  title?: string
  quantity?: number
}

export interface PdfGanttRow {
  id?: number | string
  title: string
  start_date: string
  end_date: string
  resources?: PdfGanttResource[]
}

export interface PdfGanttMilestone {
  id?: number | string
  title: string
  date: string
}

export interface PdfGanttGroup {
  id?: number | string
  code?: string
  title: string
  start_date?: string
  end_date?: string
  rows: PdfGanttRow[]
  milestones?: PdfGanttMilestone[]
}

export interface PdfGanttOptions {
  /** Начало печатного диапазона YYYY-MM-DD (включительно) */
  from: string
  /** Конец печатного диапазона YYYY-MM-DD (включительно) */
  to: string
  /** Якорь шкалы: ячейка с индексом 0 */
  origin: Date | string
  /** Единица ячейки: день или декада */
  unit: PlanningUnit
  /** Ширина ячейки в экранных px (8..96) */
  cellWidthPx: number
  /** Заголовок в колонтитуле */
  pageTitle?: string
}

const dowMap = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

/** База данных шрифтов на уровне модуля: загружаем один раз, внедряем в каждый документ */
let fontBytesCache: { regular: Uint8Array; bold: Uint8Array } | null = null

async function loadFontBytes(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  if (fontBytesCache) return fontBytesCache
  const [regular, bold] = await Promise.all([
    fetch(robotoRegularUrl).then((r) => r.arrayBuffer()),
    fetch(robotoBoldUrl).then((r) => r.arrayBuffer()),
  ])
  fontBytesCache = { regular: new Uint8Array(regular), bold: new Uint8Array(bold) }
  return fontBytesCache
}

interface DrawCtx {
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  unit: PlanningUnit
  origin: Date | string
  cellW: number
  headerH: number
  contentW: number
}

/** pdf-y для top-y (координаты от верхнего края страницы с учётом поля) */
const pdfY = (top: number): number => PAGE_H - MARGIN - top

/** pdf-y базовой линии текста, центрированного в полосе [bandTop, bandTop+bandH] */
const textY = (bandTop: number, bandH: number, size: number): number =>
  pdfY(bandTop + (bandH - size) / 2 + size * 0.8)

/** Обрезает текст многоточием до maxWidth */
function truncate(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let out = text
  while (out.length > 1 && font.widthOfTextAtSize(out + '…', size) > maxWidth) {
    out = out.slice(0, -1)
  }
  return out + '…'
}

/** Подпись числа ячейки: для дня — число; для декады — диапазон дней (1-10, 11-20, 21-конец) */
function numLabel(origin: Date | string, unit: PlanningUnit, i: number): string {
  const s = cellStartDate(origin, unit, i)
  const e = cellEndDate(origin, unit, i)
  return s.getDate() === e.getDate() ? String(s.getDate()) : `${s.getDate()}-${e.getDate()}`
}

function monthLabel(d: Date): string {
  const m = d.toLocaleDateString('ru', { month: 'long' })
  return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear()
}

/** Месяц ячейки в абсолютном счёте (для объединения полос) */
function monthKey(origin: Date | string, unit: PlanningUnit, i: number): number {
  const d = cellStartDate(origin, unit, i)
  return d.getFullYear() * 12 + d.getMonth()
}

interface GroupLayout {
  group: PdfGanttGroup
  top: number
  height: number
}

/** Рисует календарную шапку: месяц/числа/дни недели + границы ячеек */
function drawHeader(ctx: DrawCtx, colFrom: number, colTo: number, cellWidthPx: number) {
  const { page, font, bold, unit, cellW, headerH, contentW } = ctx
  const bands: { top: number; h: number }[] = [{ top: 0, h: monthRowH }]
  const showNumRow = cellWidthPx >= (unit === 'day' ? CELL_PX_NUM_DAY : CELL_PX_NUM_DECADE)
  const showWdRow = unit === 'day' && cellWidthPx >= CELL_PX_WD_DAY
  if (showNumRow) bands.push({ top: monthRowH, h: numRowH })
  if (showWdRow) bands.push({ top: monthRowH + numRowH, h: wdRowH })

  page.drawRectangle({ x: 0, y: pdfY(headerH), width: contentW, height: headerH, color: HEADER_BG })

  // Вертикальные границы ячеек в шапке
  for (let k = colFrom; k <= colTo + 1; k++) {
    const x = labelW + (k - colFrom) * cellW
    page.drawLine({ start: { x, y: pdfY(0) }, end: { x, y: pdfY(headerH) }, thickness: 0.5, color: HEADER_LINE })
  }

  // Полосы месяцев: метка центрируется по видимой части месяца; при узких ячейках
  // размер шрифта уменьшается, чтобы название месяца осталось читаемым
  let i = colFrom
  while (i <= colTo) {
    const key = monthKey(ctx.origin, unit, i)
    let j = i
    while (j <= colTo && monthKey(ctx.origin, unit, j) === key) j++
    const x0 = labelW + (i - colFrom) * cellW
    const x1 = labelW + (j - colFrom) * cellW
    const label = monthLabel(cellStartDate(ctx.origin, unit, i))
    const maxW = Math.max(x1 - x0 - 2, 6)
    let size = 8.25
    while (size > 4.5 && bold.widthOfTextAtSize(label, size) > maxW) size -= 0.5
    const text = truncate(bold, label, size, maxW)
    const tw = bold.widthOfTextAtSize(text, size)
    page.drawText(text, {
      x: x0 + (x1 - x0 - tw) / 2,
      y: textY(0, monthRowH, size),
      size,
      font: bold,
      color: TEXT_MAIN,
    })
    i = j
  }

  // Числа и дни недели по ячейкам
  if (showNumRow) {
    for (let k = colFrom; k <= colTo; k++) {
      const x = labelW + (k - colFrom) * cellW
      const label = numLabel(ctx.origin, unit, k)
      const size = 7.5
      const tw = font.widthOfTextAtSize(label, size)
      if (tw <= cellW - 2) {
        page.drawText(label, { x: x + (cellW - tw) / 2, y: textY(monthRowH, numRowH, size), size, font, color: TEXT_MID })
      }
    }
  }
  if (showWdRow) {
    for (let k = colFrom; k <= colTo; k++) {
      const x = labelW + (k - colFrom) * cellW
      const label = dowMap[cellStartDate(ctx.origin, unit, k).getDay()]
      const size = 7.5
      const tw = font.widthOfTextAtSize(label, size)
      if (tw <= cellW - 2) {
        page.drawText(label, {
          x: x + (cellW - tw) / 2,
          y: textY(monthRowH + numRowH, wdRowH, size),
          size,
          font,
          color: TEXT_FAINT,
        })
      }
    }
  }

  // Нижняя граница шапки
  page.drawLine({ start: { x: 0, y: pdfY(headerH) }, end: { x: contentW, y: pdfY(headerH) }, thickness: 0.75, color: GROUP_LINE })
}

/** Вертикальные линии сетки для видимого окна (от шапки до низа таблицы) */
function drawGrid(ctx: DrawCtx, colFrom: number, colTo: number, winTop: number, winBottom: number) {
  const { page, cellW, headerH } = ctx
  for (let k = colFrom; k <= colTo + 1; k++) {
    const x = labelW + (k - colFrom) * cellW
    page.drawLine({
      start: { x, y: pdfY(headerH) },
      end: { x, y: pdfY(winBottom - winTop) },
      thickness: 0.4,
      color: GRID_LINE,
    })
  }
}

/** Рисует группу (полоса вех, объединённый лейбл, бары задач), обрезая по видимому окну */
function drawGroup(ctx: DrawCtx, gl: GroupLayout, colFrom: number, colTo: number, winTop: number, winBottom: number) {
  const { page, font, bold, unit, cellW } = ctx
  const g = gl.group
  const top = gl.top
  const bottom = top + gl.height
  const visibleTop = Math.max(top, winTop)
  const visibleBottom = Math.min(bottom, winBottom)
  if (visibleTop >= visibleBottom) return

  const x0 = labelW
  const x1 = labelW + (colTo - colFrom + 1) * cellW

  // Подложка границ группы (как .gg-overlay) по фактическому спару дат
  const s = cellRangeForSpanSafe(ctx.origin, unit, g.start_date, g.end_date)
  if (s) {
    const ox = Math.max(x0, labelW + (Math.max(s.startCell, colFrom) - colFrom) * cellW)
    const ox1 = Math.min(x1, labelW + (Math.min(s.endCell, colTo + 1) - colFrom) * cellW)
    if (ox1 - ox > 0) {
      page.drawRectangle({
        x: ox,
        y: pdfY(visibleBottom - winTop),
        width: ox1 - ox,
        height: visibleBottom - visibleTop,
        color: rgb(0, 0, 0),
        opacity: 0.04,
      })
    }
  }

  // Объединённый лейбл группы (код + имя + даты)
  const labelTop = top + msStripH
  const labelBottom = bottom
  const lvTop = Math.max(labelTop, winTop)
  const lvBottom = Math.min(labelBottom, winBottom)
  if (lvTop < lvBottom) {
    page.drawRectangle({ x: 0, y: pdfY(lvBottom - winTop), width: labelW, height: lvBottom - lvTop, color: WHITE })
    const padX = 9
    const maxW = labelW - padX * 2
    let cursor = lvTop - winTop + 3
    if (g.code) {
      const size = 12
      page.drawText(truncate(bold, g.code, size, maxW), { x: padX, y: pdfY(cursor + size * 0.8), size, font: bold, color: CODE_COLOR })
      cursor += size * 1.3
    }
    const titleSize = 9
    page.drawText(truncate(bold, g.title, titleSize, maxW), { x: padX, y: pdfY(cursor + titleSize * 0.8), size: titleSize, font: bold, color: TEXT_MAIN })
    cursor += titleSize * 1.3
    if (g.start_date && g.end_date) {
      const dSize = 7.5
      const range = `${toDate(g.start_date).toLocaleDateString('ru')} — ${toDate(g.end_date).toLocaleDateString('ru')}`
      page.drawText(truncate(font, range, dSize, maxW), { x: padX, y: pdfY(cursor + dSize * 0.8), size: dSize, font, color: TEXT_DIM })
    }
    // Границы лейбла
    page.drawLine({ start: { x: labelW, y: pdfY(lvBottom - winTop) }, end: { x: labelW, y: pdfY(lvTop - winTop) }, thickness: 0.75, color: LABEL_LINE })
  }

  // Вехи: флажок в полосе + луч вниз по группе
  for (const ms of g.milestones ?? []) {
    if (!ms.date) continue
    const idx = cellIndexForDate(ctx.origin, unit, ms.date)
    if (idx < colFrom || idx > colTo) continue
    const cx = labelW + (idx - colFrom) * cellW + cellW / 2
    const flagW = Math.max(cellW * 0.5, 3)
    const flagH = 12
    const fx = cx - flagW / 2
    const flagTop = top + 1.5
    page.drawRectangle({ x: fx, y: pdfY(flagTop + flagH), width: flagW, height: flagH, color: MS_COLOR })
    // Луч от полосы вех до низа группы
    page.drawLine({
      start: { x: cx, y: pdfY(top + msStripH) },
      end: { x: cx, y: pdfY(bottom) },
      thickness: 1.5,
      color: MS_COLOR,
      opacity: 0.55,
    })
  }

  // Бары задач
  const rows = g.rows ?? []
  for (let i = 0; i < rows.length; i++) {
    const bandTop = top + msStripH + i * rowH
    if (bandTop >= winBottom || bandTop + rowH <= winTop) continue
    const row = rows[i]
    const span = cellRangeForSpanSafe(ctx.origin, unit, row.start_date, row.end_date)
    if (!span) continue
    const barX = labelW + (span.startCell - colFrom) * cellW
    const barX1 = labelW + (span.endCell - colFrom) * cellW
    const bx = Math.max(barX, x0)
    const bx1 = Math.min(barX1, x1)
    if (bx1 - bx <= 0) continue
    const by = pdfY(bandTop - winTop + (rowH - barH) / 2 + barH)
    page.drawRectangle({ x: bx, y: by, width: bx1 - bx, height: barH, color: BAR_COLOR, opacity: 0.75 })

    // Текст на баре: название + код проекта, если помещается
    const pad = 6
    if (bx1 - bx >= pad * 2 + 10) {
      const size = 9
      let cx = bx + pad
      const avail = bx1 - bx - pad * 2
      const title = truncate(bold, row.title, size, avail)
      const tw = bold.widthOfTextAtSize(title, size)
      let codeW = 0
      if (g.code && tw + 4.5 < avail) {
        const cs = 7.5
        const codeText = truncate(bold, g.code, cs, avail - tw - 4.5 - 7)
        codeW = bold.widthOfTextAtSize(codeText, cs) + 8
        if (codeW + tw + 4.5 <= avail) {
          page.drawText(title, { x: cx, y: textY(bandTop - winTop, rowH, size), size, font: bold, color: WHITE })
          cx += tw + 4.5
          const bh = 12
          page.drawRectangle({ x: cx, y: textY(bandTop - winTop, rowH, bh) - bh, width: codeW, height: bh, color: rgb(0, 0, 0), opacity: 0.22 })
          page.drawText(codeText, { x: cx + 4, y: textY(bandTop - winTop, rowH, cs), size: cs, font: bold, color: WHITE })
        }
      }
      if (!codeW) page.drawText(title, { x: cx, y: textY(bandTop - winTop, rowH, size), size, font: bold, color: WHITE })
    }
  }
}

/** Спан интервала дат в ячейках; null, если даты некорректны */
function cellRangeForSpanSafe(
  origin: Date | string,
  unit: PlanningUnit,
  start?: string,
  end?: string,
): { startCell: number; endCell: number } | null {
  if (!start || !end) return null
  const s = toDate(start).getTime()
  const e = toDate(end).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null
  return {
    startCell: cellIndexForDate(origin, unit, start),
    endCell: Math.max(cellIndexForDate(origin, unit, end) + 1, cellIndexForDate(origin, unit, start) + 1),
  }
}

/** Красная линия «сегодня» в видимом окне */
function drawToday(ctx: DrawCtx, colFrom: number, colTo: number, winTop: number, winBottom: number) {
  const idx = cellIndexForDate(ctx.origin, ctx.unit, new Date())
  if (idx < colFrom || idx > colTo) return
  const x = labelW + (idx - colFrom) * ctx.cellW + ctx.cellW / 2
  ctx.page.drawLine({
    start: { x, y: pdfY(ctx.headerH) },
    end: { x, y: pdfY(winBottom - winTop) },
    thickness: 1.5,
    color: TODAY_COLOR,
    opacity: 0.85,
  })
}

function drawFooter(page: PDFPage, font: PDFFont, bold: PDFFont, pageNo: number, pageCount: number, opts: PdfGanttOptions) {
  const y = MARGIN + FOOTER_H
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: GRID_LINE })
  const size = 7.5
  const title = opts.pageTitle ?? ''
  const range = `${toDate(opts.from).toLocaleDateString('ru')} — ${toDate(opts.to).toLocaleDateString('ru')}`
  page.drawText(title, { x: MARGIN, y: y - size * 1.1, size, font: bold, color: TEXT_DIM })
  page.drawText(range, { x: MARGIN + bold.widthOfTextAtSize(title, size) + 12, y: y - size * 1.1, size, font, color: TEXT_FAINT })
  const pg = `Страница ${pageNo} из ${pageCount}`
  const pw = font.widthOfTextAtSize(pg, size)
  page.drawText(pg, { x: PAGE_W - MARGIN - pw, y: y - size * 1.1, size, font, color: TEXT_DIM })
}

/**
 * Рендерит диаграмму Ганта в PDF.
 * Возвращает байты PDF-файла (Uint8Array), готовые для скачивания.
 */
export async function renderGanttPdf(groups: PdfGanttGroup[], opts: PdfGanttOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const bytes = await loadFontBytes()
  // subset:false — сабсеттинг pdf-lib 1.17.1 плодит битый отдельный сабсет на каждый
  // drawText (текст пропадает в рендере). Полный шрифт внедряется корректно.
  const font = await doc.embedFont(bytes.regular, { subset: false })
  const bold = await doc.embedFont(bytes.bold, { subset: false })

  const unit = opts.unit
  const cellWidthPx = Math.max(8, Math.min(96, opts.cellWidthPx || 32))
  const cellW = cellWidthPx * PT
  const headerH = headerHeight(unit, cellWidthPx) * PT
  const fromCell = cellIndexForDate(opts.origin, unit, opts.from)
  const toCell = Math.max(fromCell, cellIndexForDate(opts.origin, unit, opts.to))
  const totalCells = toCell - fromCell + 1

  const contentW = PAGE_W - 2 * MARGIN
  const cellsPerPage = Math.max(1, Math.floor((contentW - labelW) / cellW))
  const pagesAcross = Math.max(1, Math.ceil(totalCells / cellsPerPage))

  const layouts: GroupLayout[] = []
  let top = headerH
  for (const g of groups) {
    const height = msStripH + Math.max((g.rows ?? []).length * rowH, minGroupH)
    layouts.push({ group: g, top, height })
    top += height
  }
  const tableH = top
  const tableBottom = PAGE_H - MARGIN - FOOTER_H
  const availH = tableBottom - MARGIN
  const pagesDown = Math.max(1, Math.ceil(tableH / availH))

  for (let r = 0; r < pagesDown; r++) {
    for (let c = 0; c < pagesAcross; c++) {
      const page = doc.addPage([PAGE_W, PAGE_H])
      const ctx: DrawCtx = { page, font, bold, unit, origin: opts.origin, cellW, headerH, contentW }
      const colFrom = c * cellsPerPage
      const colTo = Math.min(colFrom + cellsPerPage, totalCells) - 1
      const winTop = r * availH
      const winBottom = Math.min(tableH, (r + 1) * availH)

      drawHeader(ctx, colFrom, colTo, cellWidthPx)
      drawGrid(ctx, colFrom, colTo, winTop, winBottom)
      drawToday(ctx, colFrom, colTo, winTop, winBottom)
      for (const gl of layouts) drawGroup(ctx, gl, colFrom, colTo, winTop, winBottom)

      // Разделители групп на всю ширину таблицы
      for (const gl of layouts) {
        const y = gl.top + gl.height
        if (y <= winTop || y >= winBottom) continue
        page.drawLine({
          start: { x: labelW, y: pdfY(y - winTop) },
          end: { x: contentW, y: pdfY(y - winTop) },
          thickness: 0.75,
          color: GROUP_LINE,
        })
      }

      drawFooter(page, font, bold, r * pagesAcross + c + 1, pagesDown * pagesAcross, opts)
    }
  }

  return doc.save()
}
