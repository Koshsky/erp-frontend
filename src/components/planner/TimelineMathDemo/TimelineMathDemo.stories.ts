import type { Meta, StoryObj } from '@storybook/vue3-vite'
import {
  cellIndexForDate,
  cellStartDate,
  cellEndDate,
  windowCells,
  spanToDates,
  type PlanningUnit,
} from '../calendar'

const meta: Meta = {
  title: 'Planner/TimelineMath (Фаза 1)',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

const fmtRange = (a: Date, b: Date) => {
  const aM = `${a.getDate()}.${a.getMonth() + 1}`
  const bM = `${b.getDate()}.${b.getMonth() + 1}.${b.getFullYear()}`
  return `${aM}–${bM}`
}

/** Consistency check: each cell's range must contain exactly itself */
function consistency(origin: string, unit: PlanningUnit, from: number, count: number): boolean {
  const cells = windowCells(origin, unit, from, count)
  return cells.every((c) => {
    const s = cellIndexForDate(origin, unit, cellStartDate(origin, unit, c.index))
    const e = cellIndexForDate(origin, unit, cellEndDate(origin, unit, c.index))
    return s === c.index && e === c.index
  })
}

/** Month color for visual clarity of the decade calendar alignment */
function monthColor(d: Date): string {
  const palette = ['#e3f2fd', '#fff3e0', '#e8f5e9', '#fce4ec', '#ede7f6', '#e0f7fa']
  return palette[((d.getFullYear() * 12 + d.getMonth()) % 6 + 6) % 6]
}

export const DayCells: Story = {
  render: () => ({
    data: () => ({
      origin: '2026-07-15',
      cells: windowCells('2026-07-15', 'day', -8, 26),
      decadeCells: windowCells('2026-07-15', 'decade', -4, 10),
      decadeCellsFromMonthStart: windowCells('2026-07-01', 'decade', 0, 6),
      originIdx: cellIndexForDate('2026-07-15', 'day', '2026-07-15'),
      span: spanToDates('2026-07-15', 'day', 2, 6),
    }),
    methods: { fmt, fmtRange, monthColor, consistency },
    template: `
      <div style="font-family:sans-serif;max-width:1100px;">
        <h3 style="margin:0 0 6px;font-size:15px;">День: origin = 2026-07-15, индексы -8..17</h3>
        <div style="display:flex;overflow-x:auto;gap:2px;padding-bottom:10px;margin-bottom:18px;">
          <div v-for="c in cells" :key="c.index"
            :style="{ minWidth: 56, textAlign: 'center', fontSize: 11, padding: '4px 2px', border: '1px solid #e0e0e0', borderRadius: 4,
                      background: c.index === originIdx ? '#1a73e8' : '#fafafa', color: c.index === originIdx ? '#fff' : '#333' }">
            <div style="font-weight:700;">{{ c.index }}</div>
            <div>{{ fmt(c.start) }}</div>
          </div>
        </div>
        <p style="font-size:12px;color:#555;margin:0 0 20px;">
          Синяя ячейка — индекс 0 (origin). Отрицательные индексы — слева от якоря, положительные — справа.
          Проверка спана [2,6) → {{ span.start_date }} … {{ span.end_date }}
        </p>

        <h3 style="margin:0 0 6px;font-size:15px;">Декада: origin = 2026-07-15, индексы -4..5</h3>
        <div style="display:flex;overflow-x:auto;gap:2px;margin-bottom:8px;">
          <div v-for="c in decadeCells" :key="c.index"
            :style="{ minWidth: 96, textAlign: 'center', fontSize: 11, padding: '4px 2px', border: '1px solid #e0e0e0', borderRadius: 4,
                      background: monthColor(c.start), color: '#333' }">
            <div style="font-weight:700;">#{{ c.index }}</div>
            <div>{{ fmtRange(c.start, c.end) }}</div>
          </div>
        </div>
        <p style="font-size:12px;color:#555;margin:0 0 20px;">
          Декады строго по календарю (1-10/11-20/21-конец), фоном выделены месяцы.
          Ячейка 0 — декада, содержащая origin (средняя декада июля), слева от неё декады того же месяца с отрицательными индексами.
        </p>

        <h3 style="margin:0 0 6px;font-size:15px;">Декада: origin = 2026-07-01 (первое число — как стартовая позиция)</h3>
        <div style="display:flex;overflow-x:auto;gap:2px;margin-bottom:8px;">
          <div v-for="c in decadeCellsFromMonthStart" :key="c.index"
            :style="{ minWidth: 96, textAlign: 'center', fontSize: 11, padding: '4px 2px', border: '1px solid #e0e0e0', borderRadius: 4,
                      background: monthColor(c.start), color: '#333' }">
            <div style="font-weight:700;">#{{ c.index }}</div>
            <div>{{ fmtRange(c.start, c.end) }}</div>
          </div>
        </div>
        <p style="font-size:12px;color:#555;margin:0;">
          Согласованность (индекс ячейки === индексы её границ): день={{ consistency('2026-07-01','day',-100,200) ? 'OK' : 'FAIL' }},
          декада={{ consistency('2026-07-15','decade',-50,100) ? 'OK' : 'FAIL' }}
        </p>
      </div>
    `,
  }),
}
