import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import TimelineGrid from './TimelineGrid.vue'
import GanttBar from '../GanttBar/GanttBar.vue'
import { cellRangeForSpan, type PlanningUnit } from '../calendar'
import { LABEL_WIDTH } from '../layout'

const meta: Meta<typeof TimelineGrid> = {
  title: 'Planner/TimelineGrid (Фаза 2)',
  component: TimelineGrid,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

const origin = '2026-07-01'

const rows = [
  { id: 1, name: 'Задача А', start: '2026-07-03', end: '2026-07-18', color: '#1a73e8' },
  { id: 2, name: 'Задача Б (старт в июне)', start: '2026-06-20', end: '2026-07-25', color: '#34a853' },
  { id: 3, name: 'Задача В', start: '2026-08-01', end: '2026-08-20', color: '#e8710a' },
]

function monthLabel(d: Date): string {
  const m = d.toLocaleDateString('ru', { month: 'long' })
  return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear()
}

function monthGroups(indices: number[], start: (i: number) => Date): { key: string; label: string; from: number; to: number }[] {
  const out: { key: string; label: string; from: number; to: number }[] = []
  for (const i of indices) {
    const d = start(i)
    const key = d.getFullYear() + '-' + d.getMonth()
    const last = out[out.length - 1]
    if (last && last.key === key) last.to = i
    else out.push({ key, label: monthLabel(d), from: i, to: i })
  }
  return out
}

function baseTemplate(unit: PlanningUnit): string {
  return `
    <div style="font-family:sans-serif;max-width:1100px;">
      <p style="font-size:12px;color:#555;margin:0 0 8px;">
        origin = 2026-07-01 у левого края. Листай шкалу ${unit === 'day' ? 'влево/вправо' : ''} — ячейки и сетка
        пересобираются, диапазон расширяется бесконечно. ${unit === 'day' ? 'Задача Б начинается в июне — левее якоря.' : ''}
      </p>
      <TimelineGrid :origin="origin" unit="${unit}">
        <template #default="{ t }">
          <div style="position:sticky;top:0;z-index:30;background:#f8f9fa;border-bottom:2px solid #1a73e8;height:56px;">
            <div style="position:sticky;left:0;width:${LABEL_WIDTH}px;height:100%;background:#f8f9fa;z-index:3;display:inline-flex;align-items:center;padding:0 10px;font-weight:700;font-size:12px;">Объект / процесс</div>
            <div v-for="m in monthGroups(t.visibleIndices, t.cellStart)" :key="'m'+m.from"
              :style="{ position:'absolute', top:2, left: t.cellLeft(m.from)+'px', width: (m.to-m.from+1)*t.cellPx+'px', height:18, fontSize:11, fontWeight:600, color:'#444', overflow:'hidden', whiteSpace:'nowrap', paddingLeft:4 }">
              {{ m.label }}
            </div>
            <div v-for="i in t.visibleIndices" :key="'d'+i"
              :style="{ position:'absolute', top:20, left: t.cellLeft(i)+'px', width: t.cellPx+'px', height:36, fontSize:10, color:'#666', display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:2, borderLeft:'1px solid #e6e6e6' }">
              {{ t.cellStart(i).getDate() }}
            </div>
          </div>

          <div v-for="row in rows" :key="row.id"
            style="position:relative;height:40px;border-bottom:1px solid #f0f0f0;">
            <div style="position:sticky;left:0;width:${LABEL_WIDTH}px;height:100%;background:#fff;z-index:10;display:flex;align-items:center;padding:0 10px;font-size:12px;font-weight:600;">{{ row.name }}</div>
            <div v-if="span(t.unit, row)"
              :style="{ position:'absolute', left: t.cellLeft(span(t.unit,row).startCell)+'px', width: (span(t.unit,row).endCell-span(t.unit,row).startCell)*t.cellPx+'px', top:4, height:30, background: row.color, borderRadius:5, color:'#fff', display:'flex', alignItems:'center', padding:'0 8px', fontSize:11, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden' }">
              {{ row.name }}
            </div>
          </div>
        </template>
      </TimelineGrid>
    </div>
  `
}

export const Days: Story = {
  render: () => ({
    components: { TimelineGrid },
    setup() {
      return {
        origin,
        rows,
        monthGroups,
        span: (unit: PlanningUnit, r: (typeof rows)[number]) =>
          cellRangeForSpan(origin, unit, r.start, r.end),
      }
    },
    template: baseTemplate('day'),
  }),
}

export const Decades: Story = {
  render: () => ({
    components: { TimelineGrid },
    setup() {
      return {
        origin,
        rows,
        monthGroups,
        span: (unit: PlanningUnit, r: (typeof rows)[number]) =>
          cellRangeForSpan(origin, unit, r.start, r.end),
      }
    },
    template: baseTemplate('decade'),
  }),
}

/** Драг + автопрокрутка: реальные GanttBar внутри TimelineGrid.
 *  Перетащи бар к краю — шкала автоматически прокрутится (диапазон расширится). */
export const DragAutoscroll: Story = {
  render: () => ({
    components: { TimelineGrid, GanttBar },
    setup() {
      const rows = ref([
        { id: 1, start: '2026-07-03', end: '2026-07-18', color: '#1a73e8' },
        { id: 2, start: '2026-06-20', end: '2026-07-25', color: '#34a853' },
        { id: 3, start: '2026-08-01', end: '2026-08-20', color: '#e8710a' },
      ])
      return {
        origin,
        rows,
        span: (unit: PlanningUnit, r: { start: string; end: string }) =>
          cellRangeForSpan(origin, unit, r.start, r.end),
      }
    },
    template: `
      <div style="font-family:sans-serif;max-width:1100px;">
        <p style="font-size:12px;color:#555;margin:0 0 8px;">
          Перетащи бар к правому/левому краю — шкала автопрокрутится. Ресайз за ручки тоже работает.
        </p>
        <TimelineGrid :origin="origin" unit="day">
          <template #default="{ t }">
            <div style="position:sticky;top:0;z-index:30;background:#f8f9fa;border-bottom:2px solid #1a73e8;height:20px;">
              <div style="position:sticky;left:0;width:${LABEL_WIDTH}px;height:100%;background:#f8f9fa;z-index:3;display:flex;align-items:center;padding:0 10px;font-weight:700;font-size:12px;">Задачи</div>
            </div>
            <div v-for="row in rows" :key="row.id" style="position:relative;height:40px;border-bottom:1px solid #f0f0f0;">
              <div style="position:sticky;left:0;width:${LABEL_WIDTH}px;height:100%;background:#fff;z-index:10;display:flex;align-items:center;padding:0 10px;font-size:12px;font-weight:600;">Задача {{ row.id }}</div>
              <div style="position:absolute;inset:0;">
                <GanttBar
                  :timeline="t"
                  :startDate="row.start"
                  :endDate="row.end"
                  :color="row.color"
                  draggable
                  @change="(d) => (row.start = d.start_date, row.end = d.end_date)"
                />
              </div>
            </div>
          </template>
        </TimelineGrid>
      </div>
    `,
  }),
}
