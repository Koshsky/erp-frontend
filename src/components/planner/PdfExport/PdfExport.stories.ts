import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect } from 'vitest'
import PdfExport from './PdfExport.vue'
import { renderGanttPdf } from './pdfRenderer'
import { renderPdfPreview } from './previewPdf'
import type { PdfGanttGroup } from './pdfRenderer'
import type { PdfExportProcess } from './types'

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const demoProcesses: PdfExportProcess[] = [
  {
    id: 1,
    title: 'Инсталляция',
    project_code: 'MVS-001',
    owner_id: 10,
    start_date: iso(2026, 7, 15),
    end_date: iso(2026, 8, 22),
    milestones: [
      { id: 101, title: 'Согласование сметы', date: iso(2026, 7, 19) },
      { id: 102, title: 'Поставка материалов', date: iso(2026, 7, 27) },
      { id: 103, title: 'Окончание работ', date: iso(2026, 8, 20) },
    ],
    tasks: [
      { id: 1, title: 'Осмотр объекта', start_date: iso(2026, 7, 15), end_date: iso(2026, 7, 17), resources: [{ code: 'ПР', quantity: 1 }] },
      { id: 2, title: 'Монтаж кабеленесущих систем', start_date: iso(2026, 7, 17), end_date: iso(2026, 7, 27), resources: [{ code: 'М', quantity: 4 }] },
      { id: 3, title: 'Пуско-наладочные работы', start_date: iso(2026, 8, 5), end_date: iso(2026, 8, 15), resources: [{ code: 'И', quantity: 2 }] },
    ],
  },
  {
    id: 2,
    title: 'Тестирование комплекса систем телемедицины',
    project_code: 'MVS-002',
    owner_id: 20,
    start_date: iso(2026, 8, 1),
    end_date: iso(2026, 9, 15),
    milestones: [{ id: 201, title: 'Приёмка', date: iso(2026, 9, 12) }],
    tasks: [
      { id: 4, title: 'Предоставить карту сети', start_date: iso(2026, 8, 1), end_date: iso(2026, 8, 5), resources: [{ code: 'РСИ', quantity: 1 }] },
      { id: 5, title: 'Тестирование MVS VEGA', start_date: iso(2026, 8, 20), end_date: iso(2026, 9, 10), resources: [{ code: 'И', quantity: 3 }] },
      { id: 6, title: 'Проведение инструктажа', start_date: iso(2026, 9, 10), end_date: iso(2026, 9, 15), resources: [{ code: 'И', quantity: 1 }] },
    ],
  },
]

const meta: Meta<typeof PdfExport> = {
  title: 'Components/Planner/PdfExport',
  component: PdfExport,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    processes: demoProcesses,
    origin: '2026-07-01',
    unit: 'day',
    pageTitle: 'Диаграмма задач',
    ownerId: 10,
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Decades: Story = {
  args: {
    origin: '2026-07-01',
    unit: 'decade',
  },
}

/** Открывает диалог печати с живым предпросмотром (для документации) */
export const OpenDialog: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('button')?.click()
    await new Promise((r) => setTimeout(r, 1500))
  },
}

/** Тест рендерера: валидный PDF, непустой, с кириллическими шрифтами */
export const RendererProducesPdf: Story = {
  tags: ['vitest'],
  play: async () => {
    const groups: PdfGanttGroup[] = demoProcesses.map((p) => ({
      id: p.id,
      code: p.project_code,
      title: p.title ?? '',
      start_date: p.start_date,
      end_date: p.end_date,
      rows: (p.tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title ?? '',
        start_date: t.start_date ?? '',
        end_date: t.end_date ?? '',
      })),
      milestones: (p.milestones ?? []).map((m) => ({ id: m.id, title: m.title ?? '', date: m.date ?? '' })),
    }))

    const bytes = await renderGanttPdf(groups, {
      from: iso(2026, 7, 1),
      to: iso(2026, 9, 30),
      origin: '2026-07-01',
      unit: 'day',
      cellWidthPx: 32,
      pageTitle: 'Диаграмма задач',
    })

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBeGreaterThan(1000)
    const text = new TextDecoder().decode(bytes.slice(0, 64))
    expect(text.startsWith('%PDF-')).toBe(true)
  },
}

/** Тест рендерера: декадная шкала и узкая ячейка тоже дают валидный PDF */
export const RendererDecades: Story = {
  tags: ['vitest'],
  play: async () => {
    const groups: PdfGanttGroup[] = demoProcesses.map((p) => ({
      id: p.id,
      code: p.project_code,
      title: p.title ?? '',
      rows: (p.tasks ?? []).map((t) => ({ title: t.title ?? '', start_date: t.start_date ?? '', end_date: t.end_date ?? '' })),
    }))
    const bytes = await renderGanttPdf(groups, {
      from: iso(2026, 7, 1),
      to: iso(2026, 12, 31),
      origin: '2026-07-01',
      unit: 'decade',
      cellWidthPx: 12,
      pageTitle: 'Диаграмма задач',
    })
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  },
}

/** Тест предпросмотра: по сгенерированным байтам pdf.js рисует страницы в контейнер */
export const PreviewRendersCanvas: Story = {
  tags: ['vitest'],
  play: async () => {
    const groups: PdfGanttGroup[] = demoProcesses.map((p) => ({
      id: p.id,
      code: p.project_code,
      title: p.title ?? '',
      start_date: p.start_date,
      end_date: p.end_date,
      rows: (p.tasks ?? []).map((t) => ({ title: t.title ?? '', start_date: t.start_date ?? '', end_date: t.end_date ?? '' })),
    }))
    const bytes = await renderGanttPdf(groups, {
      from: iso(2026, 7, 1),
      to: iso(2026, 9, 30),
      origin: '2026-07-01',
      unit: 'day',
      cellWidthPx: 32,
      pageTitle: 'Диаграмма задач',
    })

    const container = document.createElement('div')
    container.style.width = '600px'
    document.body.appendChild(container)
    const handle = await renderPdfPreview(bytes, container)
    try {
      expect(handle.pageCount).toBeGreaterThan(0)
      expect(container.querySelectorAll('canvas').length).toBe(handle.pageCount)
      const first = container.querySelector('canvas')
      expect(first).toBeTruthy()
      if (first) expect(first.width).toBeGreaterThan(0)
    } finally {
      handle.destroy()
      container.remove()
    }
  },
}
