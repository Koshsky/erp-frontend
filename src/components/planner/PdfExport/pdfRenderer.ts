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
import { cellIndexForDate, cellStartDate, cellEndDate, fmtDate, toDate, type PlanningUnit } from '../calendar'
import { DAY_MS } from '../../../utils'
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

/** Равный отступ со всех сторон листа (pt) */
const MARGIN = 16
const FOOTER_H = 18

/** Ширина колонки названий в pt (180px экрана) */
const labelW = LABEL_WIDTH * PT
/** Полоса вех в группе в pt (20px) */
const msStripH = 20 * PT
/** Мин. высота объединённого лейбла группы в pt (64px, как на экране) */
const minGroupH = 64 * PT
/** Высоты строк шапки (px на экране 18, верхний отступ 2) */
const monthRowH = 20 * PT
const numRowH = 18 * PT
const wdRowH = 18 * PT
/** Высота строки ресурса в блоке занятости в pt (18px) */
const rsRowH = 18 * PT

type Color = ReturnType<typeof rgb>

/** Палитра отрисовки: цветной (как на экране) или чёрно-белый контурный */
interface Palette {
  headerBg: Color
  headerLine: Color
  groupLine: Color
  gridLine: Color
  labelLine: Color
  labelBg: Color
  textMain: Color
  textMid: Color
  textDim: Color
  textFaint: Color
  /** Название месяца в шапке (#444) */
  textHeader: Color
  /** Числа в шапке (#666) */
  textHeaderNum: Color
  /** Заголовок группы в merged-лейбле (#555) */
  groupTitle: Color
  /** Код процесса в объединённом лейбле группы */
  codeText: Color
  bar: Color
  barOpacity: number
  barText: Color
  barBorder?: Color
  barBorderWidth: number
  badgeText: Color
  badgeBorder?: Color
  badgeBorderWidth: number
  codeBadgeBg: Color
  codeBadgeOpacity: number
  resBadgeBg: Color
  resBadgeOpacity: number
  ms: Color
  /** Цвет луча вехи (в ч/б — чёрный, чтобы луч был виден над барами) */
  msRay: Color
  msOpacity: number
  msBorder?: Color
  msBorderWidth: number
  today: Color
  todayOpacity: number
  groupTint: Color
  groupTintOpacity: number
  usageNormal: Color
  usageWarn: Color
  usageCritical: Color
  usageWeekend: Color
  usageUnknown: Color
  /** Текст внутри цветных ячеек занятости */
  usageText: Color
}

const BLACK = rgb(0, 0, 0)
const WHITE = rgb(1, 1, 1)

/** Цветной стиль — текущая раскраска планировщика */
const COLOR_PALETTE: Palette = {
  headerBg: rgb(248 / 255, 249 / 255, 250 / 255), // #f8f9fa
  headerLine: rgb(230 / 255, 230 / 255, 230 / 255), // #e6e6e6
  groupLine: rgb(224 / 255, 224 / 255, 224 / 255), // #e0e0e0
  gridLine: rgb(228 / 255, 230 / 255, 232 / 255), // #e4e6e8
  labelLine: rgb(240 / 255, 240 / 255, 240 / 255), // #f0f0f0
  labelBg: WHITE,
  textMain: rgb(0.2, 0.2, 0.2),
  textMid: rgb(0.333, 0.333, 0.333),
  textDim: rgb(0.533, 0.533, 0.533),
  textFaint: rgb(0.6, 0.6, 0.6),
  textHeader: rgb(68 / 255, 68 / 255, 68 / 255), // #444
  textHeaderNum: rgb(102 / 255, 102 / 255, 102 / 255), // #666
  groupTitle: rgb(85 / 255, 85 / 255, 85 / 255), // #555
  codeText: rgb(26 / 255, 115 / 255, 232 / 255), // #1a73e8
  bar: rgb(52 / 255, 168 / 255, 83 / 255), // #34a853
  barOpacity: 0.75,
  barText: WHITE,
  barBorder: undefined,
  barBorderWidth: 0,
  badgeText: WHITE,
  badgeBorder: undefined,
  badgeBorderWidth: 0,
  codeBadgeBg: BLACK,
  codeBadgeOpacity: 0.22,
  resBadgeBg: rgb(217 / 255, 48 / 255, 37 / 255), // #d93025
  resBadgeOpacity: 1,
  ms: rgb(251 / 255, 188 / 255, 4 / 255), // #fbbc04
  msRay: rgb(251 / 255, 188 / 255, 4 / 255), // #fbbc04
  msOpacity: 0.55,
  msBorder: undefined,
  msBorderWidth: 0,
  today: rgb(229 / 255, 57 / 255, 53 / 255), // #e53935
  todayOpacity: 0.9,
  groupTint: BLACK,
  groupTintOpacity: 0.04,
  usageNormal: rgb(170 / 255, 207 / 255, 207 / 255), // #aacfcf
  usageWarn: rgb(230 / 255, 212 / 255, 136 / 255), // #e6d488
  usageCritical: rgb(224 / 255, 154 / 255, 154 / 255), // #e09a9a
  usageWeekend: rgb(240 / 255, 240 / 255, 240 / 255), // #f0f0f0
  usageUnknown: WHITE,
  usageText: rgb(0.2, 0.2, 0.2), // #333
}

/** Чёрно-белый контурный стиль: все тексты чёрные, блоки — светло-серые с контуром */
const MONO_PALETTE: Palette = {
  headerBg: WHITE,
  headerLine: rgb(200 / 255, 200 / 255, 200 / 255), // #c8c8c8
  groupLine: rgb(144 / 255, 144 / 255, 144 / 255), // #909090
  gridLine: rgb(224 / 255, 224 / 255, 224 / 255), // #e0e0e0
  labelLine: rgb(216 / 255, 216 / 255, 216 / 255), // #d8d8d8
  labelBg: WHITE,
  textMain: BLACK,
  textMid: BLACK,
  textDim: BLACK,
  textFaint: BLACK,
  textHeader: BLACK,
  textHeaderNum: BLACK,
  groupTitle: BLACK,
  codeText: BLACK,
  bar: rgb(236 / 255, 236 / 255, 236 / 255), // #ececec
  barOpacity: 1,
  barText: BLACK,
  barBorder: BLACK,
  barBorderWidth: 0.6,
  badgeText: BLACK,
  badgeBorder: BLACK,
  badgeBorderWidth: 0.6,
  codeBadgeBg: rgb(224 / 255, 224 / 255, 224 / 255), // #e0e0e0
  codeBadgeOpacity: 1,
  resBadgeBg: WHITE,
  resBadgeOpacity: 1,
  ms: rgb(240 / 255, 240 / 255, 240 / 255), // #f0f0f0
  msRay: BLACK,
  msOpacity: 0.5,
  msBorder: BLACK,
  msBorderWidth: 0.6,
  today: BLACK,
  todayOpacity: 1,
  groupTint: BLACK,
  groupTintOpacity: 0.02,
  usageNormal: rgb(242 / 255, 242 / 255, 242 / 255), // #f2f2f2
  usageWarn: rgb(214 / 255, 214 / 255, 214 / 255), // #d6d6d6
  usageCritical: rgb(184 / 255, 184 / 255, 184 / 255), // #b8b8b8
  usageWeekend: rgb(250 / 255, 250 / 255, 250 / 255), // #fafafa
  usageUnknown: WHITE,
  usageText: BLACK,
}

function buildPalette(style?: 'color' | 'mono'): Palette {
  return style === 'mono' ? MONO_PALETTE : COLOR_PALETTE
}

export interface PdfGanttResource {
  /** id ресурса (resource_id из DTO) — для сопоставления в блоке занятости */
  id?: number
  code?: string
  title?: string
  quantity?: number
}

export interface PdfGanttRow {
  id?: number | string
  title: string
  start_date: string
  end_date: string
  /** Проект строки (для фильтра «Скрыть проекты» на уровне строк) */
  project_id?: number
  /** Владелец строки (для фильтра «Только мои» на уровне строк) */
  owner_id?: number
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
  /** Проект группы (для фильтра «Скрыть проекты» на уровне групп) */
  project_id?: number
  /** Владелец группы (для фильтра «Только мои» на уровне групп) */
  owner_id?: number
  rows: PdfGanttRow[]
  milestones?: PdfGanttMilestone[]
}

/** Период доступности ресурса (как в /timesheet/calendar) */
export interface PdfGanttAvailabilityPeriod {
  start_date: string
  end_date: string
  /** Максимальное количество ресурса на этом периоде (активные − отсутствующие) */
  available: number
}

/** Ресурс для блока занятости (как ResourceHeader на экране) */
export interface PdfGanttResourceInfo {
  id: number
  code: string
  title?: string
  /** Периоды доступности из /timesheet/calendar — учитывают табель и даты нанят/уволен */
  periods?: PdfGanttAvailabilityPeriod[]
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
  /** Заголовок в колонтитуле */
  pageTitle?: string
  /** Масштаб печати (зум страницы Ctrl+wheel): множитель плотности контента */
  scale?: number
  /** Толщина строки в экранных px (default 26); бар = строка − 2px */
  rowHeight?: number
  /** Рисовать ли полосу вех и флажки (по умолчанию true) */
  showMilestones?: boolean
  /** Рисовать ли линию «сегодня» (по умолчанию true) */
  showTodayLine?: boolean
  /** Стиль отрисовки: цветной (как на экране) или чёрно-белый контурный */
  style?: 'color' | 'mono'
  /** Ресурсы для блока занятости под календарным заголовком */
  resources?: PdfGanttResourceInfo[]
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
  /** Высота полосы вех в группе (0, если вехи скрыты) */
  stripH: number
  /** Группы для расчёта занятости ресурсов */
  groups: PdfGanttGroup[]
  /** Верх контента на странице: шапка календаря + блок ресурсов (pt) */
  groupsStart: number
  /** Масштаб печати (зум страницы): множитель размеров контента */
  z: number
  /** Размеры контента, масштабированные на z */
  layout: PdfLayout
  /** Палитра текущего стиля (цветной / чёрно-белый) */
  palette: Palette
}

/** Размеры контента диаграммы (pt), уже умноженные на масштаб z */
interface PdfLayout {
  rowH: number
  barH: number
  msStripH: number
  minGroupH: number
  monthRowH: number
  numRowH: number
  wdRowH: number
  rsRowH: number
}

/** pdf-y для top-y (координаты от верхнего края страницы с учётом поля) */
const pdfY = (top: number): number => PAGE_H - MARGIN - top

/** Путь скруглённого прямоугольника в SVG-координатах (y вниз; r — радиусы углов) */
function roundedRectPath(
  w: number,
  h: number,
  r: { tl: number; tr: number; br: number; bl: number },
): string {
  const rad = (v: number) => Math.max(0, Math.min(v, w / 2, h / 2))
  const tl = rad(r.tl)
  const tr = rad(r.tr)
  const br = rad(r.br)
  const bl = rad(r.bl)
  return (
    `M ${tl},0 L ${w - tr},0 Q ${w},0 ${w},${tr} ` +
    `L ${w},${h - br} Q ${w},${h} ${w - br},${h} ` +
    `L ${bl},${h} Q 0,${h} 0,${h - bl} ` +
    `L 0,${tl} Q 0,0 ${tl},0 Z`
  )
}

/** Скруглённый прямоугольник: top — координата от верха страницы (как drawRectangle) */
function drawRoundedRect(
  page: PDFPage,
  opts: {
    x: number
    top: number
    w: number
    h: number
    r: number | { tl: number; tr: number; br: number; bl: number }
    color: Color
    opacity?: number
    borderColor?: Color
    borderWidth?: number
  },
) {
  const r = typeof opts.r === 'number' ? { tl: opts.r, tr: opts.r, br: opts.r, bl: opts.r } : opts.r
  page.drawSvgPath(roundedRectPath(opts.w, opts.h, r), {
    x: opts.x,
    y: pdfY(opts.top),
    color: opts.color,
    opacity: opts.opacity,
    borderColor: opts.borderColor,
    borderWidth: opts.borderWidth,
  })
}

/** pdf-y базовой линии текста, центрированного в полосе [bandTop, bandTop+bandH] */
const textY = (bandTop: number, bandH: number, size: number): number =>
  pdfY(bandTop + (bandH - size) / 2 + size * 0.8)

/** pdf-y базовой линии текста, центрированного по вертикальной оси center */
const centerTextY = (center: number, size: number): number => pdfY(center + size * 0.8 - size / 2)

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
  /** Высота полосы вех внутри этой группы (0 — вехи скрыты) */
  stripH: number
}

/** Занятость ресурса в день: сумма quantity по задачам, покрывающим день */
function usageForDay(groups: PdfGanttGroup[], resourceId: number, day: Date): number {
  const t = day.getTime()
  let used = 0
  for (const g of groups) {
    for (const row of g.rows ?? []) {
      const s = toDate(row.start_date).getTime()
      const e = toDate(row.end_date).getTime()
      if (Number.isNaN(s) || Number.isNaN(e) || t < s || t > e) continue
      const a = (row.resources ?? []).find((r) => r.id === resourceId)
      if (a) used += a.quantity ?? 0
    }
  }
  return used
}

/** Доступность ресурса на день из периодов /timesheet/calendar (null — нет покрытия) */
function availableForDay(r: PdfGanttResourceInfo, day: Date): number | null {
  const periods = r.periods
  if (!periods || !periods.length) return null
  const iso = fmtDate(day)
  for (const p of periods) {
    if (p.start_date && p.end_date && iso >= p.start_date && iso <= p.end_date) {
      return p.available ?? 0
    }
  }
  return null
}

/**
 * Блок занятости ресурсов (как ResourceHeader): строка на ресурс под календарным
 * заголовком, в колонке названий — код, по ячейкам — пик загрузки за дни ячейки
 * с цветом по состоянию (норма/перегруз/критично/выходной/нет данных).
 */
function drawResourceHeader(
  ctx: DrawCtx,
  resources: PdfGanttResourceInfo[],
  colFrom: number,
  colTo: number,
) {
  const { page, font, bold, unit, cellW, headerH, groups, layout, z, palette } = ctx
  const yTop = headerH
  const height = resources.length * layout.rsRowH

  // Колонка названий: белая подложка + коды ресурсов
  page.drawRectangle({ x: MARGIN, y: pdfY(yTop + height), width: labelW, height, color: palette.labelBg })
  for (let ri = 0; ri < resources.length; ri++) {
    const r = resources[ri]
    const top = yTop + ri * layout.rsRowH
    page.drawText(truncate(bold, r.code, 9 * z, labelW - 14), {
      x: MARGIN + 6,
      y: textY(top, layout.rsRowH, 9 * z),
      size: 9 * z,
      font: bold,
      color: palette.textMain,
    })
  }
  page.drawLine({
    start: { x: MARGIN + labelW, y: pdfY(yTop) },
    end: { x: MARGIN + labelW, y: pdfY(yTop + height) },
    thickness: 0.75,
    color: palette.labelLine,
  })

  // Ячейки загрузки по видимым индексам
  for (let ri = 0; ri < resources.length; ri++) {
    const r = resources[ri]
    const top = yTop + ri * layout.rsRowH
    for (let k = colFrom; k <= colTo; k++) {
      const x = MARGIN + labelW + (k - colFrom) * cellW
      const start = cellStartDate(ctx.origin, unit, k)
      const end = cellEndDate(ctx.origin, unit, k)
      let peak = 0
      let weekend = true
      let minAvail: number | null = null
      let hasUnknown = false
      const cur = new Date(start)
      while (cur <= end) {
        const wd = cur.getDay() === 0 || cur.getDay() === 6
        if (!wd) weekend = false
        peak = Math.max(peak, usageForDay(groups, r.id, cur))
        const availDay = availableForDay(r, cur)
        if (availDay == null) hasUnknown = true
        else minAvail = minAvail == null ? availDay : Math.min(minAvail, availDay)
        cur.setDate(cur.getDate() + 1)
      }
      // Доступность ячейки как в планировщике: минимум по дням; если хоть один
      // день без периода — состояние «нет данных»
      const avail = hasUnknown ? null : minAvail
      // Состояние по проценту загрузки, как в UsageCell: ≤100% норма, до 160%
      // перегруз, >160% критично (0 доступных с занятостью — критично)
      let state: 'normal' | 'warn' | 'critical' | 'weekend' | 'unknown'
      if (weekend) state = 'weekend'
      else if (avail == null) state = 'unknown'
      else if (avail === 0) state = peak > 0 ? 'critical' : 'normal'
      else {
        const pct = (peak / avail) * 100
        state = pct <= 100 ? 'normal' : pct <= 160 ? 'warn' : 'critical'
      }
      const bg =
        state === 'weekend'
          ? palette.usageWeekend
          : state === 'unknown'
            ? palette.usageUnknown
            : state === 'warn'
              ? palette.usageWarn
              : state === 'critical'
                ? palette.usageCritical
                : palette.usageNormal
      page.drawRectangle({ x, y: pdfY(top + layout.rsRowH), width: cellW, height: layout.rsRowH, color: bg })
      // Числа занятости: шрифт адаптивный — стартует от масштаба (6.75×z) и ширины
      // ячейки, при нехватке места уменьшается, чтобы «used/cap» помещалось
      // (при низком зуме шрифт мельче — числа видны даже в узких ячейках).
      const label = avail == null ? `${peak}` : `${peak}/${avail}`
      let size = Math.min(6.75 * z, cellW * 0.6)
      while (size >= 1.5 && font.widthOfTextAtSize(label, size) > cellW - 1) size -= 0.25
      if (size >= 1.5) {
        const tw = font.widthOfTextAtSize(label, size)
        const textColor =
          state === 'weekend' || state === 'unknown' ? palette.textFaint : palette.usageText
        page.drawText(label, {
          x: x + (cellW - tw) / 2,
          y: textY(top, layout.rsRowH, size),
          size,
          font: bold,
          color: textColor,
        })
      }
    }
    // Разделитель строки ресурса
    page.drawLine({
      start: { x: MARGIN + labelW, y: pdfY(top + layout.rsRowH) },
      end: { x: MARGIN + labelW + (colTo - colFrom + 1) * cellW, y: pdfY(top + layout.rsRowH) },
      thickness: 0.4,
      color: palette.gridLine,
    })
  }
}

/** Рисует календарную шапку: месяц/числа/дни недели + границы ячеек */
function drawHeader(ctx: DrawCtx, colFrom: number, colTo: number, cellWidthPx: number) {
  const { page, font, bold, unit, cellW, headerH, contentW, layout, z, palette } = ctx
  const bands: { top: number; h: number }[] = [{ top: 0, h: layout.monthRowH }]
  const showNumRow = cellWidthPx >= (unit === 'day' ? CELL_PX_NUM_DAY : CELL_PX_NUM_DECADE)
  const showWdRow = unit === 'day' && cellWidthPx >= CELL_PX_WD_DAY
  if (showNumRow) bands.push({ top: layout.monthRowH, h: layout.numRowH })
  if (showWdRow) bands.push({ top: layout.monthRowH + layout.numRowH, h: layout.wdRowH })

  page.drawRectangle({ x: MARGIN, y: pdfY(headerH), width: contentW, height: headerH, color: palette.headerBg })

  // Вертикальные границы ячеек в шапке
  for (let k = colFrom; k <= colTo + 1; k++) {
    const x = MARGIN + labelW + (k - colFrom) * cellW
    page.drawLine({ start: { x, y: pdfY(0) }, end: { x, y: pdfY(headerH) }, thickness: 0.5, color: palette.headerLine })
  }

  // Полосы месяцев: метка центрируется по видимой части месяца; при узких ячейках
  // размер шрифта уменьшается, чтобы название месяца осталось читаемым
  let i = colFrom
  while (i <= colTo) {
    const key = monthKey(ctx.origin, unit, i)
    let j = i
    while (j <= colTo && monthKey(ctx.origin, unit, j) === key) j++
    const x0 = MARGIN + labelW + (i - colFrom) * cellW
    const x1 = MARGIN + labelW + (j - colFrom) * cellW
    const label = monthLabel(cellStartDate(ctx.origin, unit, i))
    const maxW = Math.max(x1 - x0 - 2, 6)
    let size = 8.25 * z
    while (size > 4.5 * z && bold.widthOfTextAtSize(label, size) > maxW) size -= 0.5 * z
    const text = truncate(bold, label, size, maxW)
    const tw = bold.widthOfTextAtSize(text, size)
    page.drawText(text, {
      x: x0 + (x1 - x0 - tw) / 2,
      y: textY(0, layout.monthRowH, size),
      size,
      font: bold,
      color: palette.textHeader,
    })
    i = j
  }

  // Числа и дни недели по ячейкам
  if (showNumRow) {
    for (let k = colFrom; k <= colTo; k++) {
      const x = MARGIN + labelW + (k - colFrom) * cellW
      const label = numLabel(ctx.origin, unit, k)
      const size = 7.5 * z
      const tw = font.widthOfTextAtSize(label, size)
      if (tw <= cellW - 2) {
        page.drawText(label, { x: x + (cellW - tw) / 2, y: textY(layout.monthRowH, layout.numRowH, size), size, font, color: palette.textHeaderNum })
      }
    }
  }
  if (showWdRow) {
    for (let k = colFrom; k <= colTo; k++) {
      const x = MARGIN + labelW + (k - colFrom) * cellW
      const label = dowMap[cellStartDate(ctx.origin, unit, k).getDay()]
      const size = 7.5 * z
      const tw = font.widthOfTextAtSize(label, size)
      if (tw <= cellW - 2) {
        page.drawText(label, {
          x: x + (cellW - tw) / 2,
          y: textY(layout.monthRowH + layout.numRowH, layout.wdRowH, size),
          size,
          font,
          color: palette.textFaint,
        })
      }
    }
  }

  // Нижняя граница шапки
  page.drawLine({ start: { x: MARGIN, y: pdfY(headerH) }, end: { x: MARGIN + contentW, y: pdfY(headerH) }, thickness: 0.75, color: palette.groupLine })
}

/** Вертикальные линии сетки для видимого окна (от шапки до низа таблицы) */
function drawGrid(ctx: DrawCtx, colFrom: number, colTo: number, winTop: number, winBottom: number) {
  const { page, cellW, headerH, palette } = ctx
  for (let k = colFrom; k <= colTo + 1; k++) {
    const x = MARGIN + labelW + (k - colFrom) * cellW
    page.drawLine({
      start: { x, y: pdfY(headerH) },
      end: { x, y: pdfY(winBottom - winTop) },
      thickness: 0.4,
      color: palette.gridLine,
    })
  }
}

/** Рисует группу (полоса вех, объединённый лейбл, бары задач), обрезая по видимому окну */
function drawGroup(ctx: DrawCtx, gl: GroupLayout, colFrom: number, colTo: number, winTop: number, winBottom: number) {
  const { page, font, bold, unit, cellW, stripH, groupsStart, layout, z, palette } = ctx
  const g = gl.group
  const strip = gl.stripH
  const top = gl.top
  const bottom = top + gl.height
  // Верх видимого среза: контент ниже шапки и блока ресурсов (page-local = y - winTop)
  const clipTop = winTop + groupsStart
  const visibleTop = Math.max(top, clipTop)
  const visibleBottom = Math.min(bottom, winBottom)
  if (visibleTop >= visibleBottom) return

  const x0 = MARGIN + labelW
  const x1 = MARGIN + labelW + (colTo - colFrom + 1) * cellW

  // Подложка границ группы (как .gg-overlay) по фактическому спару дат
  const s = cellRangeForSpanSafe(ctx.origin, unit, g.start_date, g.end_date)
  if (s) {
    const ox = Math.max(x0, MARGIN + labelW + (Math.max(s.startCell, colFrom) - colFrom) * cellW)
    const ox1 = Math.min(x1, MARGIN + labelW + (Math.min(s.endCell, colTo + 1) - colFrom) * cellW)
    if (ox1 - ox > 0) {
      page.drawRectangle({
        x: ox,
        y: pdfY(visibleBottom - winTop),
        width: ox1 - ox,
        height: visibleBottom - visibleTop,
        color: palette.groupTint,
        opacity: palette.groupTintOpacity,
      })
    }
  }

  // Объединённый лейбл группы (код + имя + даты). Текст рисуем только на первой
  // странице группы (labelTop виден в срезе): на продолжениях — белая подложка
  // и граница, чтобы не дублировалась «ячейка» описания процесса.
  const labelTop = top + strip
  const labelBottom = bottom
  const lvTop = Math.max(labelTop, clipTop)
  const lvBottom = Math.min(labelBottom, winBottom)
  const showLabelText = labelTop >= clipTop
  if (lvTop < lvBottom) {
    page.drawRectangle({ x: MARGIN, y: pdfY(lvBottom - winTop), width: labelW, height: lvBottom - lvTop, color: palette.labelBg })
    const padX = 9
    const maxW = labelW - padX * 2
    let cursor = lvTop - winTop + 3
    if (showLabelText && g.code) {
      const size = 12 * z
      page.drawText(truncate(bold, g.code, size, maxW), { x: MARGIN + padX, y: pdfY(cursor + size * 0.8), size, font: bold, color: palette.codeText })
      cursor += size * 1.3
    }
    if (showLabelText) {
      const titleSize = 9 * z
      page.drawText(truncate(bold, g.title, titleSize, maxW), { x: MARGIN + padX, y: pdfY(cursor + titleSize * 0.8), size: titleSize, font: bold, color: palette.groupTitle })
      cursor += titleSize * 1.3
      if (g.start_date && g.end_date) {
        const dSize = 7.5 * z
        const range = `${toDate(g.start_date).toLocaleDateString('ru')} — ${toDate(g.end_date).toLocaleDateString('ru')}`
        page.drawText(truncate(font, range, dSize, maxW), { x: MARGIN + padX, y: pdfY(cursor + dSize * 0.8), size: dSize, font, color: palette.textDim })
      }
    }
    // Границы лейбла
    page.drawLine({ start: { x: MARGIN + labelW, y: pdfY(lvBottom - winTop) }, end: { x: MARGIN + labelW, y: pdfY(lvTop - winTop) }, thickness: 0.75, color: palette.labelLine })
  }

  // Бары задач
  const rows = g.rows ?? []
  for (let i = 0; i < rows.length; i++) {
    const bandTop = top + strip + i * layout.rowH
    if (bandTop >= winBottom || bandTop + layout.rowH <= clipTop) continue
    const row = rows[i]
    const span = cellRangeForSpanSafe(ctx.origin, unit, row.start_date, row.end_date)
    if (!span) continue
    const barX = MARGIN + labelW + (span.startCell - colFrom) * cellW
    const barX1 = MARGIN + labelW + (span.endCell - colFrom) * cellW
    const bx = Math.max(barX, x0)
    const bx1 = Math.min(barX1, x1)
    if (bx1 - bx <= 0) continue
    // Вертикальная обрезка бара по видимому срезу (граничная группа на стыке страниц):
    // clipTop — в page-local координатах (groupsStart), низ — winBottom - winTop
    const barTopLocal = bandTop - winTop + (layout.rowH - layout.barH) / 2
    const barBottomLocal = barTopLocal + layout.barH
    const barTopClip = Math.max(barTopLocal, groupsStart)
    const barBottomClip = Math.min(barBottomLocal, winBottom - winTop)
    if (barBottomClip - barTopClip <= 0) continue
    const barFull = barTopClip === barTopLocal && barBottomClip === barBottomLocal
    // Скругление как на экране (5px), но без радиуса с обрезанной стороны
    // на стыке страниц (иначе угол «выпирает» за край).
    const topClipped = barTopClip > barTopLocal
    const bottomClipped = barBottomClip < barBottomLocal
    const barRad = Math.min(5 * PT * z, (bx1 - bx) / 2, (barBottomClip - barTopClip) / 2)
    drawRoundedRect(page, {
      x: bx,
      top: barTopClip,
      w: bx1 - bx,
      h: barBottomClip - barTopClip,
      r: {
        tl: topClipped ? 0 : barRad,
        tr: topClipped ? 0 : barRad,
        br: bottomClipped ? 0 : barRad,
        bl: bottomClipped ? 0 : barRad,
      },
      color: palette.bar,
      opacity: palette.barOpacity,
      borderColor: palette.barBorder,
      borderWidth: palette.barBorderWidth,
    })

    // Текст на баре: название + бейдж кода + бейджи ресурсов (только если бар не обрезан)
    const pad = 6
    const barCenter = (barTopClip + barBottomClip) / 2
    if (barFull && bx1 - bx >= pad * 2 + 10) {
      const size = 9 * z
      let cx = bx + pad
      const avail = bx1 - bx - pad * 2
      const title = truncate(bold, row.title, size, avail)
      const tw = bold.widthOfTextAtSize(title, size)
      page.drawText(title, { x: cx, y: centerTextY(barCenter, size), size, font: bold, color: palette.barText })
      cx += tw + 4.5

      const bh = 12 * z
      // Пилюля, как на экране (radius 10px), ограниченная высотой
      const badgeRad = Math.min(10 * PT * z, bh / 2)
      const drawBadge = (text: string, cs: number, bg: Color, opacity: number, border?: Color, borderWidth = 0) => {
        const w = bold.widthOfTextAtSize(text, cs) + 8
        const topBadge = barCenter - bh / 2
        drawRoundedRect(page, { x: cx, top: topBadge, w, h: bh, r: badgeRad, color: bg, opacity, borderColor: border, borderWidth })
        page.drawText(text, { x: cx + 4, y: centerTextY(barCenter, cs), size: cs, font: bold, color: palette.badgeText })
        cx += w + 4.5
      }

      // Бейдж кода проекта, если есть место
      if (g.code && cx + 12 < bx1 - pad) {
        const cs = 7.5 * z
        const codeText = truncate(bold, g.code, cs, bx1 - pad - cx - 8)
        if (bold.widthOfTextAtSize(codeText, cs) + 12 <= bx1 - pad - cx) {
          drawBadge(codeText, cs, palette.codeBadgeBg, palette.codeBadgeOpacity, palette.badgeBorder, palette.badgeBorderWidth)
        }
      }
      // Бейджи ресурсов, пока есть место
      for (const r of row.resources ?? []) {
        if (cx + 14 >= bx1 - pad) break
        const cs = 7.5 * z
        const label = `${r.code || r.title || '?'}×${r.quantity ?? 1}`
        const text = truncate(bold, label, cs, bx1 - pad - cx - 8)
        if (bold.widthOfTextAtSize(text, cs) + 12 > bx1 - pad - cx) break
        drawBadge(text, cs, palette.resBadgeBg, palette.resBadgeOpacity, palette.badgeBorder, palette.badgeBorderWidth)
      }
    }
  }

  // Вехи: флажок в полосе + луч вниз по группе. Рисуем ПОСЛЕ баров, чтобы луч был
  // поверх них. Полоса должна целиком влезать в видимый срез (иначе флажок
  // попадает под шапку/в поле страницы).
  if (strip > 0 && top >= clipTop && top + strip <= winBottom) {
    const rayStart = (top - winTop) + strip
    const rayEnd = Math.min(bottom - winTop, winBottom - winTop)
    for (const ms of g.milestones ?? []) {
      if (!ms.date) continue
      const idx = cellIndexForDate(ctx.origin, unit, ms.date)
      if (idx < colFrom || idx > colTo) continue
      const cx = MARGIN + labelW + (idx - colFrom) * cellW + cellW / 2
      const flagW = Math.max(cellW * 0.5, 3 * z)
      const flagH = 12 * z
      const fx = cx - flagW / 2
      const flagTop = top - winTop + 1.5 * z
      // Скругление 4px, как у .ms-marker на экране (ограничено размером флажка)
      const flagRad = Math.min(4 * PT * z, flagW / 2, flagH / 2)
      drawRoundedRect(page, { x: fx, top: flagTop, w: flagW, h: flagH, r: flagRad, color: palette.ms, opacity: 1, borderColor: palette.msBorder, borderWidth: palette.msBorderWidth })
      // Луч от полосы вех до низа группы (обрезается по низу среза)
      page.drawLine({
        start: { x: cx, y: pdfY(rayStart) },
        end: { x: cx, y: pdfY(rayEnd) },
        thickness: 1.5 * z,
        color: palette.msRay,
        opacity: palette.msOpacity,
      })
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

/** Красная линия «сегодня» в видимом окне — на границе «вчера/сегодня», как в планировщике */
function drawToday(ctx: DrawCtx, colFrom: number, colTo: number, winTop: number, winBottom: number) {
  const idx = cellIndexForDate(ctx.origin, ctx.unit, new Date())
  if (idx < colFrom || idx > colTo) return
  const now = new Date()
  const s = cellStartDate(ctx.origin, ctx.unit, idx).getTime()
  const e = cellEndDate(ctx.origin, ctx.unit, idx).getTime()
  // день — левый край ячейки «сегодня»; декада — дробная позиция текущего дня
  const frac = ctx.unit === 'decade' ? (now.getTime() - s) / (e - s + DAY_MS) : 0
  const x = MARGIN + labelW + (idx - colFrom) * ctx.cellW + frac * ctx.cellW
  ctx.page.drawLine({
    start: { x, y: pdfY(ctx.headerH) },
    end: { x, y: pdfY(winBottom - winTop) },
    thickness: 1.5,
    color: ctx.palette.today,
    opacity: ctx.palette.todayOpacity,
  })
}

function drawFooter(page: PDFPage, font: PDFFont, bold: PDFFont, pageNo: number, pageCount: number, opts: PdfGanttOptions, palette: Palette) {
  const y = MARGIN + FOOTER_H
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: palette.gridLine })
  const size = 7.5
  const title = opts.pageTitle ?? ''
  const range = `${toDate(opts.from).toLocaleDateString('ru')} — ${toDate(opts.to).toLocaleDateString('ru')}`
  page.drawText(title, { x: MARGIN, y: y - size * 1.1, size, font: bold, color: palette.textDim })
  page.drawText(range, { x: MARGIN + bold.widthOfTextAtSize(title, size) + 12, y: y - size * 1.1, size, font, color: palette.textFaint })
  const pg = `Страница ${pageNo} из ${pageCount}`
  const pw = font.widthOfTextAtSize(pg, size)
  page.drawText(pg, { x: PAGE_W - MARGIN - pw, y: y - size * 1.1, size, font, color: palette.textDim })
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
  /** Масштаб печати: зум страницы (Ctrl+wheel) — множитель плотности контента */
  const z = Math.max(0.25, Math.min(4, opts.scale ?? 1))
  /** Палитра стиля: цветной (по умолчанию) или чёрно-белый контурный */
  const palette = buildPalette(opts.style)
  /** Толщина строки (экранные px); бар на 2px тоньше строки */
  const rowHeightPx = opts.rowHeight ?? 26
  const layout: PdfLayout = {
    rowH: rowHeightPx * PT * z,
    barH: Math.max(rowHeightPx - 2, 4) * PT * z,
    msStripH: msStripH * z,
    minGroupH: minGroupH * z,
    monthRowH: monthRowH * z,
    numRowH: numRowH * z,
    wdRowH: wdRowH * z,
    rsRowH: rsRowH * z,
  }
  const fromCell = cellIndexForDate(opts.origin, unit, opts.from)
  const toCell = Math.max(fromCell, cellIndexForDate(opts.origin, unit, opts.to))
  const totalCells = toCell - fromCell + 1

  // Процессы, целиком лежащие вне печатного диапазона, исключаем из рендеринга
  // совсем: start_date >= правой границы или end_date <= левой границы.
  // Без дат (или с кривыми) процесс остаётся — рендер опирается на задачи.
  const fromTime = toDate(opts.from).getTime()
  const toTime = toDate(opts.to).getTime()
  const groupsInRange = groups.filter((g) => {
    if (!g.start_date || !g.end_date) return true
    const s = toDate(g.start_date).getTime()
    const e = toDate(g.end_date).getTime()
    if (Number.isNaN(s) || Number.isNaN(e)) return true
    return s < toTime && e > fromTime
  })

  /** Полоса вех: 0, если вехи скрыты опцией печати */
  const stripH = opts.showMilestones === false ? 0 : layout.msStripH
  /** Ресурсы для блока занятости (пусто — блок не рисуется) */
  const resources = opts.resources ?? []

  const contentW = PAGE_W - 2 * MARGIN
  /** Ширина ячейки под вписывание ВСЕГО диапазона дат на одну страницу */
  const cellW = Math.max((contentW - labelW) / totalCells, 0.5)
  /** Эффективная «экранная» ширина ячейки для порогов шапки */
  const cellWidthPx = cellW / PT
  const headerH = headerHeight(unit, cellWidthPx) * PT * z
  /** Весь диапазон — на одной странице по ширине (без горизонтальной пагинации) */
  const pagesAcross = 1

  // Группы в «своих» координатах (0 = сразу под шапкой/ресурсами)
  const layouts: GroupLayout[] = []
  let top = 0
  for (const g of groupsInRange) {
    const height = stripH + Math.max((g.rows ?? []).length * layout.rowH, layout.minGroupH)
    layouts.push({ group: g, top, height, stripH })
    top += height
  }
  const tableH = top
  const tableBottom = PAGE_H - MARGIN - FOOTER_H
  const availH = tableBottom - MARGIN
  const resourcesH = resources.length * layout.rsRowH
  /** Верх контента на странице: шапка календаря + блок ресурсов */
  const groupsStart = headerH + resourcesH
  /** Высота страницы под группы (после шапки и ресурсов) */
  const groupsAvail = Math.max(availH - groupsStart, 50)

  // Разбивка страниц ТОЛЬКО по границам строк: страница вмещает целые строки,
  // иначе последняя строка (и её бар) целиком переносится на следующую страницу.
  const rowTops: number[] = []
  for (const gl of layouts) {
    const rowsCount = (gl.group.rows ?? []).length
    for (let i = 0; i < rowsCount; i++) rowTops.push(gl.top + gl.stripH + i * layout.rowH)
  }
  const pageBreaks: number[] = []
  {
    let start = 0
    while (start < tableH) {
      pageBreaks.push(start)
      const limit = start + groupsAvail
      let end = start
      for (const t of rowTops) {
        if (t >= start && t + layout.rowH <= limit && t + layout.rowH > end) {
          end = t + layout.rowH
        }
      }
      // Страховка: ни одна строка не «влезла» — режем по пиксельной высоте
      if (end <= start) end = Math.min(start + groupsAvail, tableH)
      start = end
    }
  }
  // Хвостовая пустая страница: если после последней строки осталась только
  // высота мин-группы (последняя группа короче своих строк), строки кончаются
  // раньше tableH — лишние разрывы страниц убираем.
  if (rowTops.length > 0) {
    const rowsEnd = Math.max(...rowTops) + layout.rowH
    while (pageBreaks.length > 1 && pageBreaks[pageBreaks.length - 1] >= rowsEnd) pageBreaks.pop()
  }
  const pagesDown = pageBreaks.length

  for (let r = 0; r < pagesDown; r++) {
    for (let c = 0; c < pagesAcross; c++) {
      const page = doc.addPage([PAGE_W, PAGE_H])
      const ctx: DrawCtx = {
        page,
        font,
        bold,
        unit,
        origin: opts.origin,
        cellW,
        headerH,
        contentW,
        stripH,
        groups: groupsInRange,
        groupsStart,
        z,
        layout,
        palette,
      }
      // Абсолютные индексы ячеек: весь диапазон — на одной странице по ширине.
      const colFrom = fromCell
      const colTo = toCell
      // Вертикальная пагинация по границам строк: winTop сдвинут на groupsStart,
      // чтобы первый видимый слой групп начинался ПОД шапкой и блоком ресурсов;
      // winBottom — граница среза (конец последней полной строки).
      const start = pageBreaks[r]
      const end = r + 1 < pagesDown ? pageBreaks[r + 1] : tableH
      const winTop = start - groupsStart
      const winBottom = end

      drawHeader(ctx, colFrom, colTo, cellWidthPx)
      drawGrid(ctx, colFrom, colTo, winTop, winBottom)
      if (resources.length) drawResourceHeader(ctx, resources, colFrom, colTo)
      for (const gl of layouts) drawGroup(ctx, gl, colFrom, colTo, winTop, winBottom)

      // Разделители групп на всю ширину таблицы (только в видимом срезе ниже шапки)
      for (const gl of layouts) {
        const y = gl.top + gl.height
        if (y <= winTop + groupsStart || y >= winBottom) continue
        page.drawLine({
          start: { x: MARGIN + labelW, y: pdfY(y - winTop) },
          end: { x: MARGIN + contentW, y: pdfY(y - winTop) },
          thickness: 0.75,
          color: palette.groupLine,
        })
      }

      // Линия «сегодня» рисуется последней — поверх баров и лучей вех (как на экране);
      // колонку названий она не пересекает (стартует от x >= labelW)
      if (opts.showTodayLine !== false) drawToday(ctx, colFrom, colTo, winTop, winBottom)

      drawFooter(page, font, bold, r * pagesAcross + c + 1, pagesDown * pagesAcross, opts, palette)
    }
  }

  return doc.save()
}
