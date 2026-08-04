import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TaskBar from './TaskBar.vue'

const now = new Date()
const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d)
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const meta: Meta<typeof TaskBar> = {
  title: 'Components/Planner/TaskBar',
  component: TaskBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

function withTask(task: any, anchor: Date, mode: 'quarter' | 'half' | 'year', unit: 'day' | 'decade'): Story['render'] {
  return () => ({
    components: { TaskBar },
    data: () => ({ anchor, mode, unit, task }),
    template: `
      <div style="max-width:700px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;height:40px;background:#f0f0f0;border-radius:6px;">
          <TaskBar :anchor="anchor" :mode="mode" :unit="unit" :task="task" />
        </div>
      </div>
    `,
  })
}
export const OneResource: Story = {
  render: withTask(
    {
      id: 1, title: 'Осмотр объекта',
      start_date: iso(day(4)), end_date: iso(day(9)),
      resources: [{ resource_id: 1, assignment_id: 1, quantity: 2, code: 'И' }],
    },
    day(1), 'quarter', 'day',
  ),
}

export const MultipleResources: Story = {
  render: withTask(
    {
      id: 1, title: 'Монтаж конструкций',
      start_date: iso(day(6)), end_date: iso(day(18)),
      resources: [
        { resource_id: 1, assignment_id: 1, quantity: 3, code: 'М' },
        { resource_id: 2, assignment_id: 2, quantity: 1, code: 'И' },
      ],
    },
    day(1), 'quarter', 'day',
  ),
}

export const NoResources: Story = {
  render: withTask(
    { id: 1, title: 'Задача без ресурсов', start_date: iso(day(2)), end_date: iso(day(5)), resources: [] },
    day(1), 'quarter', 'day',
  ),
}

/** Год с декадами — бар растянут на несколько декад */
export const YearDecades: Story = {
  render: withTask(
    {
      id: 1, title: 'Монтаж конструкций',
      start_date: iso(new Date(now.getFullYear(), 0, 3)), end_date: iso(new Date(now.getFullYear(), 2, 10)),
      resources: [{ resource_id: 1, assignment_id: 1, quantity: 3, code: 'М' }],
    },
    new Date(now.getFullYear(), 0, 1), 'year', 'decade',
  ),
}

/** Драг задачи, ограниченный границами процесса (groupStartDate/groupEndDate):
 *  процесс занимает средние две недели квартала, задачу нельзя вытащить за его пределы. */
export const ClampedToProcessBounds: Story = {
  render: () => ({
    components: { TaskBar },
    data: () => ({
      anchor: day(1),
      mode: 'quarter' as const,
      unit: 'day' as const,
      groupStart: iso(day(8)),
      groupEnd: iso(day(22)),
      task: {
        id: 1, title: 'Монтаж конструкций',
        start_date: iso(day(10)), end_date: iso(day(18)),
        resources: [{ resource_id: 1, assignment_id: 1, quantity: 2, code: 'М' }],
      },
      last: '—',
    }),
    methods: {
      onChange(p: { start_date: string; end_date: string }) {
        this.last = `${p.start_date} → ${p.end_date}`
      },
    },
    template: `
      <div style="max-width:700px;margin:0 auto;font-family:sans-serif;">
        <div style="font-size:12px;color:#666;margin-bottom:6px;">Подсвеченная зона — границы процесса (8–21 числа). Задача клиппится ими при драге/ресайзе.</div>
        <div style="position:relative;width:100%;height:40px;background:linear-gradient(90deg,#f0f0f0 23.3%,#e8f0fe 23.3%,#e8f0fe 70%,#f0f0f0 70%);border-radius:6px;">
          <TaskBar :anchor="anchor" :mode="mode" :unit="unit" :task="task" :groupStartDate="groupStart" :groupEndDate="groupEnd" draggable @change="onChange" />
        </div>
        <div style="font-size:12px;color:#666;margin-top:6px;">Последний результат: <b>{{ last }}</b></div>
      </div>
    `,
  }),
}
