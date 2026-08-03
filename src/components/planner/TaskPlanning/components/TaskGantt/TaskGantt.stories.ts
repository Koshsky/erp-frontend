import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TaskGantt from './TaskGantt.vue'
import { cellCount } from '../../../calendar'

const now = new Date()
const day = (m: number) => new Date(now.getFullYear(), now.getMonth(), m)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const meta: Meta<typeof TaskGantt> = {
  title: 'Components/Planner/TaskGantt',
  component: TaskGantt,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

const anchor = day(1)
const cells = cellCount(anchor, 'quarter', 'day')

const tasks = [
  { id: 1, title: 'Осмотр объекта', start_date: iso(day(2)), end_date: iso(day(5)), resources: [{ resource_id: 1, quantity: 2, code: 'И' }] },
  { id: 2, title: 'Разработка ППР', start_date: iso(day(4)), end_date: iso(day(14)), resources: [{ resource_id: 1, quantity: 1, code: 'И' }] },
  { id: 3, title: 'Закуп материалов', start_date: iso(day(6)), end_date: iso(day(20)), resources: [{ resource_id: 5, quantity: 1, code: 'СВ' }] },
  { id: 4, title: 'Монтаж конструкций', start_date: iso(day(12)), end_date: iso(day(28)), resources: [{ resource_id: 2, quantity: 3, code: 'МК' }] },
]
export const Default: Story = {
  render: () => ({
    components: { TaskGantt },
    data: () => ({ anchor, cells, tasks, title: 'Инсталляция', projectCode: 'KO-1001', mode: 'quarter' as const, unit: 'day' as const }),
    template: `
      <div :style="{ display: 'grid', gridTemplateColumns: '180px repeat(' + cells + ', 1fr)', background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
        <TaskGantt :anchor="anchor" :mode="mode" :unit="unit" :title="title" :projectCode="projectCode" :tasks="tasks" />
      </div>
    `,
  }),
}

export const WithGroupRange: Story = {
  render: () => ({
    components: { TaskGantt },
    data: () => ({
      anchor,
      cells,
      tasks,
      title: 'Монтаж',
      projectCode: 'KO-2002',
      groupStartDate: iso(day(3)),
      groupEndDate: iso(day(26)),
      mode: 'quarter' as const,
      unit: 'day' as const,
    }),
    template: `
      <div :style="{ display: 'grid', gridTemplateColumns: '180px repeat(' + cells + ', 1fr)', background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
        <TaskGantt
          :anchor="anchor" :mode="mode" :unit="unit" :title="title" :projectCode="projectCode"
          :tasks="tasks" :groupStartDate="groupStartDate" :groupEndDate="groupEndDate"
        />
      </div>
    `,
  }),
}

/** Подложка границ группы, выходящая за диаграмму, обрезана вплотную к обоим краям */
export const GroupClipped: Story = {
  render: () => ({
    components: { TaskGantt },
    data: () => ({
      anchor,
      cells,
      tasks,
      title: 'Монтаж',
      projectCode: 'KO-2003',
      groupStartDate: iso(day(-20)),
      groupEndDate: iso(day(130)),
      mode: 'quarter' as const,
      unit: 'day' as const,
    }),
    template: `
      <div :style="{ display: 'grid', gridTemplateColumns: '180px repeat(' + cells + ', 1fr)', background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
        <TaskGantt
          :anchor="anchor" :mode="mode" :unit="unit" :title="title" :projectCode="projectCode"
          :tasks="tasks" :groupStartDate="groupStartDate" :groupEndDate="groupEndDate"
        />
      </div>
    `,
  }),
}
