import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect } from 'vitest'
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

function withTask(task: any, projectCode = 'КО_505', width = 3000): Story['render'] {
  return () => ({
    components: { TaskBar },
    data: () => ({ timeline: makeDemoTimeline(iso(day(1, 1)), 'day'), task, projectCode }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;overflow-x:auto;">
        <div style="position:relative;width:${width}px;height:40px;background:#f0f0f0;border-radius:6px;">
          <TaskBar :timeline="timeline" :task="task" :projectCode="projectCode" />
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

/** Many resources on a narrow bar: badges don't fit side by side and stack up */
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
  }, 'КО_505', 600),
}

/** The task has comments — a bubble icon with a counter on the bar */
export const WithComments: Story = {
  render: withTask({
    id: 1,
    title: 'Монтаж конструкций',
    start_date: iso(day(1, 6)),
    end_date: iso(day(1, 18)),
    resources: [],
    comments_count: 5,
  }),
}

/** Task tooltip showcase with a comment log (author name + date + text) */
export const TooltipComments: Story = {
  render: () => ({
    components: { TaskBar },
    data: () => ({
      timeline: makeDemoTimeline(iso(day(1, 1)), 'day'),
      task: {
        id: 1,
        title: 'Монтаж конструкций',
        start_date: iso(day(1, 6)),
        end_date: iso(day(1, 18)),
        resources: [],
        comments_count: 2,
      },
      projectCode: 'КО_505',
      users: [
        { id: 1, name: 'Иванов Иван', last_name: 'Иванов', first_name: 'Иван', username: 'ivanov', role: 'vp' },
        { id: 2, name: 'Петров Пётр', last_name: 'Петров', first_name: 'Пётр', username: 'petrov', role: 'rp' },
      ],
      commentsByTask: {
        1: [
          { id: 1, task_id: 1, author_id: 1, content: 'Перенести сроки?', created_at: '2026-02-01T10:00:00Z' },
          { id: 2, task_id: 1, author_id: 2, parent_id: 1, content: 'Нет, сроки фиксированы.', created_at: '2026-02-01T11:30:00Z' },
        ],
      },
    }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;overflow-x:auto;">
        <div style="position:relative;width:3000px;height:40px;background:#f0f0f0;border-radius:6px;">
          <TaskBar :timeline="timeline" :task="task" :projectCode="projectCode"
                   :users="users" :comments-by-task="commentsByTask" />
        </div>
      </div>
    `,
  }),
}

/** Test: the counter badge is visible; without comments — no badge */
export const BadgeVisibility: Story = {
  tags: ['vitest'],
  render: () => ({
    components: { TaskBar },
    data: () => ({
      timeline: makeDemoTimeline(iso(day(1, 1)), 'day'),
      taskWith: {
        id: 1,
        title: 'С обсуждением',
        start_date: iso(day(1, 6)),
        end_date: iso(day(1, 18)),
        resources: [],
        comments_count: 3,
      },
      taskWithout: {
        id: 2,
        title: 'Без комментариев',
        start_date: iso(day(1, 6)),
        end_date: iso(day(1, 18)),
        resources: [],
        comments_count: 0,
      },
    }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;overflow-x:auto;">
        <div style="position:relative;width:3000px;height:40px;background:#f0f0f0;border-radius:6px;margin-bottom:8px;">
          <TaskBar :timeline="timeline" :task="taskWith" />
        </div>
        <div style="position:relative;width:3000px;height:40px;background:#f0f0f0;border-radius:6px;">
          <TaskBar :timeline="timeline" :task="taskWithout" />
        </div>
      </div>
    `,
  }),
  play: async () => {
    await new Promise((r) => setTimeout(r, 50))
    const badges = [...document.querySelectorAll('.tb-comments')]
    expect(badges.length).toBe(1)
    expect(badges[0].textContent).toContain('3')
  },
}
