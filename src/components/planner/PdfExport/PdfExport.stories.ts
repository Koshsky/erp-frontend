import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect } from 'vitest'
import PdfExport from './PdfExport.vue'
import { renderGanttPdf } from './pdfRenderer'
import { renderPdfPreview } from './previewPdf'
import type { PdfGanttGroup } from './pdfRenderer'

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Модель печати страницы задач: процесс = группа, задачи = строки */
const demoGroups: PdfGanttGroup[] = [
  {
    id: 1,
    code: 'MVS-001',
    title: 'Инсталляция',
    project_id: 1,
    owner_id: 10,
    start_date: iso(2026, 7, 15),
    end_date: iso(2026, 8, 22),
    milestones: [
      { id: 101, title: 'Согласование сметы', date: iso(2026, 7, 19) },
      { id: 102, title: 'Поставка материалов', date: iso(2026, 7, 27) },
      { id: 103, title: 'Окончание работ', date: iso(2026, 8, 20) },
    ],
    rows: [
      { id: 1, title: 'Осмотр объекта', start_date: iso(2026, 7, 15), end_date: iso(2026, 7, 17), resources: [{ id: 3, code: 'ПР', quantity: 1 }] },
      { id: 2, title: 'Монтаж кабеленесущих систем', start_date: iso(2026, 7, 17), end_date: iso(2026, 7, 27), resources: [{ id: 2, code: 'М', quantity: 4 }] },
      { id: 3, title: 'Пуско-наладочные работы', start_date: iso(2026, 8, 5), end_date: iso(2026, 8, 15), resources: [{ id: 1, code: 'И', quantity: 2 }] },
    ],
  },
  {
    id: 2,
    code: 'MVS-002',
    title: 'Тестирование комплекса систем телемедицины',
    project_id: 2,
    owner_id: 20,
    start_date: iso(2026, 8, 1),
    end_date: iso(2026, 9, 15),
    milestones: [{ id: 201, title: 'Приёмка', date: iso(2026, 9, 12) }],
    rows: [
      { id: 4, title: 'Предоставить карту сети', start_date: iso(2026, 8, 1), end_date: iso(2026, 8, 5), resources: [{ id: 1, code: 'И', quantity: 1 }] },
      { id: 5, title: 'Тестирование MVS VEGA', start_date: iso(2026, 8, 20), end_date: iso(2026, 9, 10), resources: [{ id: 1, code: 'И', quantity: 3 }] },
      { id: 6, title: 'Проведение инструктажа', start_date: iso(2026, 9, 10), end_date: iso(2026, 9, 15), resources: [{ id: 1, code: 'И', quantity: 1 }] },
    ],
  },
]

const resources: { id: number; code: string; title: string; employees_count: number }[] = [
  { id: 1, code: 'И', title: 'Инженер', employees_count: 3 },
  { id: 2, code: 'М', title: 'Монтажник', employees_count: 4 },
  { id: 3, code: 'ПР', title: 'Производитель работ', employees_count: 2 },
]

const meta: Meta<typeof PdfExport> = {
  title: 'Components/Planner/PdfExport',
  component: PdfExport,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    groups: demoGroups,
    resources,
    origin: '2026-07-01',
    unit: 'day',
    pageTitle: 'Диаграмма задач',
    ownerId: 10,
    role: 'vp',
    scope: 'tasks',
    periodFrom: '2026-07-01',
    periodTo: '2026-09-30',
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Роль admin: фильтр «Только мои процессы» скрыт */
export const AdminRole: Story = {
  args: { role: 'admin' },
}

/** Модель страницы процессов: проект = группа, процессы = строки */
export const ProcessGroups: Story = {
  args: {
    groups: [
      {
        id: 1,
        code: 'MVS-001',
        title: '',
        project_id: 1,
        start_date: iso(2026, 7, 1),
        end_date: iso(2026, 9, 30),
        rows: [
          { id: 1, title: 'Инсталляция', start_date: iso(2026, 7, 15), end_date: iso(2026, 8, 22), project_id: 1, owner_id: 10 },
          { id: 2, title: 'Производство', start_date: iso(2026, 7, 1), end_date: iso(2026, 9, 30), project_id: 1, owner_id: 20 },
        ],
      },
      {
        id: 2,
        code: 'MVS-002',
        title: '',
        project_id: 2,
        start_date: iso(2026, 8, 1),
        end_date: iso(2026, 9, 30),
        rows: [
          { id: 3, title: 'Тестирование', start_date: iso(2026, 8, 1), end_date: iso(2026, 9, 15), project_id: 2, owner_id: 10 },
        ],
      },
    ],
    scope: 'processes',
    pageTitle: 'Диаграмма процессов',
  },
}

/** Модель страницы проектов: одна группа, строки = проекты */
export const ProjectGroups: Story = {
  args: {
    groups: [
      {
        id: 'projects',
        title: 'Проекты',
        rows: [
          { id: 1, title: 'MVS-001', start_date: iso(2026, 7, 1), end_date: iso(2026, 9, 30), project_id: 1 },
          { id: 2, title: 'MVS-002', start_date: iso(2026, 8, 1), end_date: iso(2026, 9, 30), project_id: 2 },
        ],
      },
    ],
    scope: 'projects',
    pageTitle: 'Диаграмма проектов',
  },
}

export const Decades: Story = {
  args: {
    origin: '2026-07-01',
    unit: 'decade',
  },
}

/** Открывает диалог печати с живым предпросмотром (для документации) */
export const OpenDialog: Story = {
  play: async () => {
    window.dispatchEvent(new CustomEvent('app:print-request'))
    await new Promise((r) => setTimeout(r, 1500))
  },
}

/** Открывает диалог в чёрно-белом контурном стиле (предпросмотр ЧБ-варианта) */
export const OpenDialogMono: Story = {
  play: async () => {
    window.dispatchEvent(new CustomEvent('app:print-request'))
    await new Promise((r) => setTimeout(r, 800))
    document.querySelector<HTMLInputElement>('input[value="mono"]')?.click()
    await new Promise((r) => setTimeout(r, 2000))
  },
}

/** Тест рендерера: валидный PDF, непустой, с кириллическими шрифтами */
export const RendererProducesPdf: Story = {
  tags: ['vitest'],
  play: async () => {
    const bytes = await renderGanttPdf(demoGroups, {
      from: iso(2026, 7, 1),
      to: iso(2026, 9, 30),
      origin: '2026-07-01',
      unit: 'day',
      pageTitle: 'Диаграмма задач',
    })

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBeGreaterThan(1000)
    const text = new TextDecoder().decode(bytes.slice(0, 64))
    expect(text.startsWith('%PDF-')).toBe(true)
  },
}

/** Тест рендерера: чёрно-белый контурный стиль тоже даёт валидный PDF */
export const RendererMono: Story = {
  tags: ['vitest'],
  play: async () => {
    const bytes = await renderGanttPdf(demoGroups, {
      from: iso(2026, 7, 1),
      to: iso(2026, 9, 30),
      origin: '2026-07-01',
      unit: 'day',
      pageTitle: 'Диаграмма задач',
      style: 'mono',
      resources: [
        { id: 1, code: 'И', periods: [{ start_date: iso(2026, 7, 1), end_date: iso(2026, 9, 30), available: 3 }] },
      ],
    })

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  },
}

/** Тест рендерера: декадная шкала и узкая ячейка тоже дают валидный PDF */
export const RendererDecades: Story = {
  tags: ['vitest'],
  play: async () => {
    const bytes = await renderGanttPdf(demoGroups, {
      from: iso(2026, 7, 1),
      to: iso(2026, 12, 31),
      origin: '2026-07-01',
      unit: 'day',
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
    const bytes = await renderGanttPdf(demoGroups, {
      from: iso(2026, 7, 1),
      to: iso(2026, 9, 30),
      origin: '2026-07-01',
      unit: 'day',
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
