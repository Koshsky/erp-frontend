import type { Meta, StoryObj } from '@storybook/vue3-vite'
import GanttBar from './GanttBar.vue'
import { cellCount } from '../calendar'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const meta: Meta<typeof GanttBar> = {
  title: 'Components/Planner/GanttBar',
  component: GanttBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

const base = {
  anchor: day(1, 1),
  mode: 'quarter' as const,
  unit: 'day' as const,
  iso,
  day,
}

/**
 * Все вариации GanttBar на одной странице.
 * Бары разной длины и позиции на периоде квартала (январь–март):
 * цвет, прозрачность и содержимое.
 */
export const AllVariants: Story = {
  render: () => ({
    components: { GanttBar },
    data: () => ({
      ...base,
    }),
    computed: {
      trackStyle() {
        return {
          position: 'relative',
          width: '100%',
          height: '36px',
          background: '#f0f0f0',
          borderRadius: '6px',
        }
      },
      labelStyle() {
        return {
          fontSize: '11px',
          fontWeight: 600,
          color: '#444',
        }
      },
    },
    template: `
      <div style="max-width:720px;margin:0 auto;font-family:sans-serif;display:flex;flex-direction:column;gap:18px;">

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Зелёный, короткий бар в начале</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(1,4))" :endDate="iso(day(1,9))" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Синий, средний бар через границу месяцев</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(1,20))" :endDate="iso(day(2,18))" color="#1a73e8" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Жёлтый (warning), почти весь квартал</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(1,2))" :endDate="iso(day(3,25))" color="#fbbc04" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Красный (alert), короткая полоса в конце периода</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(3,5))" :endDate="iso(day(3,22))" color="#ea4335" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Полупрозрачный (opacity 0.4), середина периода</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(2,1))" :endDate="iso(day(2,25))" color="#34a853" :opacity="0.4" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">С содержимым (слот)</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(1,6))" :endDate="iso(day(2,28))">
              <span :style="labelStyle">53 дня · 2 ресурса</span>
            </GanttBar>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Плотная группа (фрагменты одного периода)</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(1,12))" :endDate="iso(day(1,20))" color="#188038" />
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(1,28))" :endDate="iso(day(2,12))" color="#188038" />
          </div>
        </div>

      </div>
    `,
  }),
}

/** Декады в пределах года — 36 колонок (январь: 3 декады + 11 месяцев × 3) */
export const DecadeCells: Story = {
  render: () => ({
    components: { GanttBar },
    data: () => {
      const anchor = day(1, 1)
      return { anchor, cells: cellCount(anchor, 'year', 'decade'), mode: 'year' as const, unit: 'decade' as const, iso, day }
    },
    template: `
      <div style="max-width:900px;margin:0 auto;font-family:sans-serif;">
        <div :style="{ display:'grid', gridTemplateColumns:'repeat(' + cells + ', 1fr)', gap:'1px', background:'#eee', marginBottom:'2px' }">
          <div v-for="i in cells" :key="'c'+i" style="height:12px;background:#f8f9fa"></div>
        </div>
        <div style="position:relative;width:100%;height:36px;background:#f0f0f0;border-radius:6px;">
          <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(1,5))" :endDate="iso(day(3,20))" color="#1a73e8" />
        </div>
        <div style="font-size:11px;color:#888;margin-top:4px;">Год, декады: бар с 5 января по 20 марта (end исключён) занимает 8 декад из {{ cells }}</div>
      </div>
    `,
  }),
}

/** Обрезка баров по границам диаграммы (квартал от 1 января, дневные ячейки):
 *  старт до anchor / конец за периодом прижаты к краю; интервалы целиком вне
 *  календаря и с end <= start не отображаются вовсе. */
export const ClippedAtEdges: Story = {
  render: () => ({
    components: { GanttBar },
    data: () => ({
      ...base,
      prevIso: (d: number) => new Date(y - 1, 11, d).toISOString().slice(0, 10),
    }),
    computed: {
      trackStyle() {
        return {
          position: 'relative',
          width: '100%',
          height: '36px',
          background: '#f0f0f0',
          borderRadius: '6px',
        }
      },
    },
    template: `
      <div style="max-width:720px;margin:0 auto;font-family:sans-serif;display:flex;flex-direction:column;gap:18px;">

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Старт до anchor — прижат к левому краю</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="prevIso(25)" :endDate="iso(day(1,20))" color="#34a853" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Конец за периодом — прижат к правому краю</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(3,10))" :endDate="iso(day(4,15))" color="#1a73e8" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Целиком левее диаграммы — не отображается</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="prevIso(1)" :endDate="prevIso(20)" color="#ea4335" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Целиком правее диаграммы — не отображается</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(5,1))" :endDate="iso(day(5,10))" color="#ea4335" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">end == start — не отображается</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(1,5))" :endDate="iso(day(1,5))" color="#fbbc04" />
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:600;color:#666;">Полностью внутри периода — эталон</div>
          <div :style="trackStyle">
            <GanttBar :anchor="anchor" :mode="mode" :unit="unit" :startDate="iso(day(1,5))" :endDate="iso(day(3,20))" color="#188038" />
          </div>
        </div>

      </div>
    `,
  }),
}
