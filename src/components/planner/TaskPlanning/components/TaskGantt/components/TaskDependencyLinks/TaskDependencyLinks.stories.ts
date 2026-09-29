import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TaskDependencyLinks from './TaskDependencyLinks.vue'
import { makeDemoTimeline } from '@/components/planner/plannerStoryHelpers'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const tasks = [
  { id: 1, title: 'Подготовка', start_date: iso(day(1, 1)), end_date: iso(day(1, 8)) },
  { id: 2, title: 'Монтаж', start_date: iso(day(1, 8)), end_date: iso(day(1, 16)) },
  { id: 3, title: 'Пусконаладка', start_date: iso(day(1, 16)), end_date: iso(day(1, 22)) },
  { id: 4, title: 'Закупка', start_date: iso(day(1, 2)), end_date: iso(day(1, 12)) },
]

// fs 1→2, fs 2→3 (chain), ss 4→2 (parallel start), ff 4→3
const dependencies = [
  { id: 1, task_id: 2, depends_on_task_id: 1, type: 'fs' as const },
  { id: 2, task_id: 3, depends_on_task_id: 2, type: 'fs' as const },
  { id: 3, task_id: 2, depends_on_task_id: 4, type: 'ss' as const },
  { id: 4, task_id: 3, depends_on_task_id: 4, type: 'ff' as const },
]

const meta: Meta<typeof TaskDependencyLinks> = {
  title: 'Components/Planner/TaskDependencyLinks',
  component: TaskDependencyLinks,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    tasks,
    dependencies,
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => ({
    components: { TaskDependencyLinks },
    data: () => ({
      timeline: makeDemoTimeline(iso(day(0, 25)), 'day'),
      tasks,
      dependencies,
    }),
    template: `
      <div style="position:relative;width:1400px;padding-top:20px;border-radius:10px;overflow:hidden;">
        <div v-for="(t, i) in tasks" :key="t.id"
             style="height:26px;box-sizing:border-box;border-bottom:1px solid #eee;font:12px/26px sans-serif;padding-left:6px;color:#555;">
          {{ t.title }}
        </div>
        <TaskDependencyLinks :timeline="timeline" :tasks="tasks" :dependencies="dependencies" />
      </div>
    `,
  }),
}