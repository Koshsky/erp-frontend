import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect } from 'vitest'
import TaskComments from './TaskComments.vue'
import type { DtoCommentResponse, DtoUserInfo } from '@/api'

const users: DtoUserInfo[] = [
  { id: 1, name: 'Иванов Иван', last_name: 'Иванов', first_name: 'Иван', username: 'ivanov', role: 'vp' },
  { id: 2, name: 'Петров Пётр', last_name: 'Петров', first_name: 'Пётр', username: 'petrov', role: 'rp' },
  { id: 3, name: 'Сидоров Сидор', last_name: 'Сидоров', first_name: 'Сидор', username: 'sidorov', role: 'worker' },
]

/** Цепочка: c1 ← c2 ← c3 (три уровня), отдельный корневой c4 и «осиротевший» c5 (родитель 999 удалён) */
const thread: DtoCommentResponse[] = [
  { id: 1, task_id: 1, author_id: 1, content: 'Перенести сроки?', created_at: '2026-02-01T10:00:00Z' },
  { id: 2, task_id: 1, author_id: 2, parent_id: 1, content: 'Нет, сроки фиксированы.', created_at: '2026-02-01T11:30:00Z' },
  { id: 3, task_id: 1, author_id: 3, parent_id: 2, content: 'Тогда уточните состав работ.', created_at: '2026-02-01T12:05:00Z' },
  { id: 4, task_id: 1, author_id: 3, content: 'Отдельный вопрос — бюджет.', created_at: '2026-02-02T09:15:00Z' },
  { id: 5, task_id: 1, author_id: 2, parent_id: 999, content: 'Ответ на удалённый комментарий.', created_at: '2026-02-03T08:00:00Z' },
]

const meta: Meta<typeof TaskComments> = {
  title: 'Components/Planner/TaskComments',
  component: TaskComments,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    open: true,
    taskId: 1,
    taskTitle: 'Монтаж конструкций',
    comments: thread,
    users,
    userId: 2,
    canManage: true,
  },
}
export default meta
type Story = StoryObj<typeof meta>

/** Полная цепочка: вложенные ответы, отдельный корень и «осиротевший» ответ */
export const Thread: Story = {}

/** Без комментариев — пустое состояние */
export const Empty: Story = {
  args: {
    comments: [],
  },
}

/** Ошибка бэкенда показывается внутри окна */
export const WithError: Story = {
  args: {
    error: 'Не удалось загрузить комментарии: сеть недоступна',
  },
}

/** Идёт загрузка — спиннер-состояние списка, отправка заблокирована */
export const Busy: Story = {
  args: {
    comments: [],
    busy: true,
  },
}

/** Офлайн: отправка заблокирована с пояснением, список из кэша виден */
export const Offline: Story = {
  args: {
    disabledReason: 'Недоступно в офлайне',
    canManage: false,
  },
}

/** Без модерации: «Удалить» только у своих комментариев (userId=2) */
export const AuthorDeleteOnly: Story = {
  args: {
    userId: 2,
    canManage: false,
  },
}

/** Тест: рендер цепочки с именами, содержимым и пометкой «осиротевшего» ответа */
export const RendersThread: Story = {
  tags: ['vitest'],
  play: async () => {
    await new Promise((r) => setTimeout(r, 50))
    const root = document.body
    expect(root.textContent).toContain('Иванов Иван')
    expect(root.textContent).toContain('Петров Пётр')
    expect(root.textContent).toContain('Перенести сроки?')
    expect(root.textContent).toContain('Тогда уточните состав работ.')
    expect(root.textContent).toContain('в ответ на удалённый комментарий')
    // Вложенные ответы рендерятся с отступом (глубина > 0)
    const items = [...document.querySelectorAll('.tc-item')]
    expect(items.length).toBeGreaterThanOrEqual(5)
    const depths = items.map((el) => (el as HTMLElement).style.marginLeft)
    expect(depths.some((d) => d === '0px')).toBe(true)
    expect(depths.some((d) => d === '28px')).toBe(true)
  },
}

/** Тест: пустое состояние и блокировка отправки в офлайне */
export const EmptyAndOffline: Story = {
  tags: ['vitest'],
  args: {
    comments: [],
    disabledReason: 'Недоступно в офлайне',
  },
  play: async () => {
    await new Promise((r) => setTimeout(r, 50))
    const root = document.body
    expect(root.textContent).toContain('Комментариев пока нет')
    expect(root.textContent).toContain('Недоступно в офлайне')
    const textareas = [...document.querySelectorAll<HTMLTextAreaElement>('.tc-input')]
    if (textareas.length) {
      expect(textareas.every((t) => t.disabled)).toBe(true)
    }
    const send = [...document.querySelectorAll<HTMLButtonElement>('.tc-send')]
    if (send.length) expect(send.every((b) => b.disabled)).toBe(true)
  },
}