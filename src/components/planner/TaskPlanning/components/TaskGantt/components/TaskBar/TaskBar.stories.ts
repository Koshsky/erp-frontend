import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TaskBar from './TaskBar.vue'
import { makeDemoTimeline } from '@/components/planner/plannerStoryHelpers'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)
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

function withTask(task: any, width = 3000): Story['render'] {
  return () => ({
    components: { TaskBar },
    data: () => ({ timeline: makeDemoTimeline(iso(day(1, 1)), 'day'), task }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;overflow-x:auto;">
        <div style="position:relative;width:${width}px;height:40px;background:#f0f0f0;border-radius:6px;">
          <TaskBar :timeline="timeline" :task="task" />
        </div>
      </div>
    `,
  })
}

export const OneResource: Story = {
  render: withTask({
    id: 1, title: 'Осмотр объекта',
    start_date: iso(day(1, 4)), end_date: iso(day(1, 9)),
    resources: [{ resource_id: 1, assignment_id: 1, quantity: 2, code: 'И' }],
  }),
}

export const MultipleResources: Story = {
  render: withTask({
    id: 1, title: 'Монтаж конструкций',
    start_date: iso(day(1, 6)), end_date: iso(day(1, 18)),
    resources: [
      { resource_id: 1, assignment_id: 1, quantity: 3, code: 'М' },
      { resource_id: 2, assignment_id: 2, quantity: 1, code: 'И' },
    ],
  }),
}

export const NoResources: Story = {
  render: withTask({
    id: 1, title: 'Задача без ресурсов', start_date: iso(day(1, 2)), end_date: iso(day(1, 5)), resources: [],
  }),
}

/** Много ресурсов на узком баре: бейджи не помещаются рядом и складываются стопкой */
export const StackedBadges: Story = {
  render: withTask({
    id: 1,
    title: 'Монтаж',
    start_date: iso(day(1, 5)),
    end_date: iso(day(1, 26)),
    resources: [
      { resource_id: 1, assignment_id: 1, quantity: 1, code: 'И' },
      { resource_id: 2, assignment_id: 2, quantity: 2, code: 'М' },
      { resource_id: 3, assignment_id: 3, quantity: 1, code: 'К' },
      { resource_id: 4, assignment_id: 4, quantity: 3, code: 'С' },
    ],
  }, 600),
}
