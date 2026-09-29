import type { ArgTypes } from '@storybook/vue3-vite'
import type { TaskEditorProps } from './types'

export const taskEditorArgTypes: ArgTypes<TaskEditorProps> = {
  open: {
    name: 'Открыто',
    description: 'Показывать модальное окно',
    control: 'boolean',
    table: { category: 'State' },
  },
  task: {
    name: 'Задача',
    description: 'Редактируемая задача (левая панель)',
    control: 'object',
    table: { type: { summary: 'TaskEditorTask | null' }, category: 'Data' },
  },
  subtasks: {
    name: 'Подзадачи',
    description: 'Список подзадач (правая панель, todo list)',
    control: 'object',
    table: { type: { summary: 'SubtaskItem[]' }, category: 'Data' },
  },
  ownerOptions: {
    name: 'Ответственные',
    description: 'Кандидаты на роль ответственного (свои сотрудники)',
    control: 'object',
    table: { type: { summary: 'OwnerOption[]' }, category: 'Data' },
  },
  canManage: {
    name: 'Может управлять',
    description: 'Разрешено менять поля задачи и подзадачи',
    control: 'boolean',
    table: { category: 'State' },
  },
  canCreateSubtask: {
    name: 'Может добавлять подзадачи',
    description: 'Разрешено создавать подзадачи',
    control: 'boolean',
    table: { category: 'State' },
  },
  busy: {
    name: 'Запрос',
    description: 'Идёт запрос к API — действия заблокированы',
    control: 'boolean',
    table: { category: 'State' },
  },
  error: {
    name: 'Ошибка',
    description: 'Сообщение об ошибке внутри окна',
    control: 'text',
    table: { category: 'State' },
  },
  disabledReason: {
    name: 'Причина блокировки',
    description: 'Пояснение, почему подзадачи недоступны (например, офлайн)',
    control: 'text',
    table: { category: 'State' },
  },
}

export default taskEditorArgTypes
export { default as TaskEditor } from './TaskEditor.vue'
export * from './types'