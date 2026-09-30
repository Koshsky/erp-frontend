import type { Meta, StoryObj } from '@storybook/vue3-vite'
import NotificationHost from './NotificationHost.vue'
import { dismissNotification, notifications, notifyError, notifySuccess } from './state'

const meta: Meta<typeof NotificationHost> = {
  title: 'Notifications/NotificationHost',
  component: NotificationHost,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

/**
 * Interactive story: pushes global notifications (the same queue the axios
 * interceptor uses) and renders the fixed host. Works in light/dark and all
 * themes (the decorators switch them).
 */
export const Default: Story = {
  render: () => ({
    components: { NotificationHost },
    methods: {
      err() {
        notifyError('Не удалось удалить пользователя «Иванов»: на него ссылаются задачи')
      },
      errLong() {
        notifyError(
          'Удаление невозможно — пользователь указан:\n• задач: 3\n• комментариев: 1\n• шаблонов автосоздания: 2',
        )
      },
      ok() {
        notifySuccess('Пользователь удалён')
      },
      clear() {
        for (const n of [...notifications.value]) dismissNotification(n.id)
      },
    },
    template: `
      <div style="padding:24px;font-family:sans-serif;display:flex;flex-direction:column;gap:10px;align-items:flex-start;">
        <p style="color:var(--muted-foreground);font-size:13px;">
          Демо глобального хоста уведомлений: тосты всплывают в нижнем левом углу и сами скрываются.
        </p>
        <div style="display:flex;gap:8px;">
          <button type="button" @click="err"
                  style="padding:8px 14px;border-radius:8px;border:none;background:var(--destructive);color:var(--destructive-foreground);cursor:pointer;">
            Ошибка удаления
          </button>
          <button type="button" @click="errLong"
                  style="padding:8px 14px;border-radius:8px;border:none;background:var(--destructive);color:var(--destructive-foreground);cursor:pointer;">
            Многострочная ошибка
          </button>
          <button type="button" @click="ok"
                  style="padding:8px 14px;border-radius:8px;border:none;background:var(--primary);color:var(--primary-foreground);cursor:pointer;">
            Успех
          </button>
          <button type="button" @click="clear"
                  style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:transparent;cursor:pointer;">
            Очистить
          </button>
        </div>
        <NotificationHost />
      </div>
    `,
  }),
}