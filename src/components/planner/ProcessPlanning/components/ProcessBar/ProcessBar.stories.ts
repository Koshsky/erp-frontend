import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProcessBar from './ProcessBar.vue'

const now = new Date()
const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const meta: Meta<typeof ProcessBar> = {
  title: 'Components/Planner/ProcessBar',
  component: ProcessBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

function withProcess(props: Record<string, any>): Story['render'] {
  return () => ({
    components: { ProcessBar },
    data: () => ({ anchor: day(1), mode: 'quarter' as const, unit: 'day' as const, draggable: true, ...props }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;height:36px;background:#f0f0f0;border-radius:6px;">
          <ProcessBar
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
            :startDate="startDate"
            :endDate="endDate"
            :title="title"
            :projectCode="projectCode"
            :color="color"
            :opacity="opacity"
            :draggable="draggable"
          />
        </div>
      </div>
    `,
  })
}

// Вспомогательные фиксированные варианты дат
const d = {
  p1s: iso(day(2)),  p1e: iso(day(38)),
  p2s: iso(day(12)), p2e: iso(day(50)),
  p3s: iso(day(20)), p3e: iso(day(45)),
}
export const Default: Story = {
  render: withProcess({ startDate: d.p1s, endDate: d.p1e, title: 'Инсталляция', projectCode: 'KO-1001' }),
}

export const DangerColor: Story = {
  render: withProcess({ startDate: d.p2s, endDate: d.p2e, title: 'Производство', projectCode: 'KO-1002', color: '#ea4335' }),
}

export const EvenSpan: Story = {
  render: withProcess({ startDate: d.p3s, endDate: d.p3e, title: 'Закупка', projectCode: 'KO-1003', color: '#34a853' }),
}

/** Год с декадами: 37 колонок, бар растянут на ~2.5 декады */
export const YearDecades: Story = {
  render: withProcess({
    anchor: new Date(now.getFullYear(), 0, 1),
    mode: 'year' as const,
    unit: 'decade' as const,
    startDate: iso(new Date(now.getFullYear(), 0, 5)),
    endDate: iso(new Date(now.getFullYear(), 2, 20)),
    title: 'Инсталляция',
    projectCode: 'KO-1004',
  }),
}

/** Драг: перетаскивание и ресайз за края; результат приходит в @change.
 *  При наведении видны ручки (ew-resize), во время драга бар следует за курсором. */
export const Draggable: Story = {
  render: () => ({
    components: { ProcessBar },
    data: () => ({
      anchor: day(1),
      mode: 'quarter' as const,
      unit: 'day' as const,
      startDate: d.p1s,
      endDate: d.p1e,
      title: 'Инсталляция',
      projectCode: 'KO-1001',
      last: '—',
    }),
    methods: {
      onChange(p: { start_date: string; end_date: string }) {
        this.last = `${p.start_date} → ${p.end_date}`
      },
    },
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;height:36px;background:#f0f0f0;border-radius:6px;">
          <ProcessBar
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
            :startDate="startDate"
            :endDate="endDate"
            :title="title"
            :projectCode="projectCode"
            @change="onChange"
          />
        </div>
        <div style="font-size:12px;color:#666;margin-top:6px;">
          Последний результат: <b>{{ last }}</b>
        </div>
      </div>
    `,
  }),
}

/** Драг процесса, ограниченный границами проекта (groupStartDate/groupEndDate):
 *  проект занимает среднюю треть квартала, процесс не вытащить за его пределы. */
export const ClampedToProjectBounds: Story = {
  render: () => ({
    components: { ProcessBar },
    data: () => ({
      anchor: day(1),
      mode: 'quarter' as const,
      unit: 'day' as const,
      startDate: d.p1s,
      endDate: d.p1e,
      title: 'Инсталляция',
      projectCode: 'KO-1001',
      groupStart: iso(day(15)),
      groupEnd: iso(day(60)),
      last: '—',
    }),
    methods: {
      onChange(p: { start_date: string; end_date: string }) {
        this.last = `${p.start_date} → ${p.end_date}`
      },
    },
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;">
        <div style="font-size:12px;color:#666;margin-bottom:6px;">Подсвеченная зона — границы проекта (15–59 числа). Процесс клиппится ими при драге/ресайзе.</div>
        <div style="position:relative;width:100%;height:36px;background:linear-gradient(90deg,#f0f0f0 15%,#e8f0fe 15%,#e8f0fe 64%,#f0f0f0 64%);border-radius:6px;">
          <ProcessBar
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
            :startDate="startDate"
            :endDate="endDate"
            :title="title"
            :projectCode="projectCode"
            :groupStartDate="groupStart"
            :groupEndDate="groupEnd"
            @change="onChange"
          />
        </div>
        <div style="font-size:12px;color:#666;margin-top:6px;">
          Последний результат: <b>{{ last }}</b>
        </div>
      </div>
    `,
  }),
}
