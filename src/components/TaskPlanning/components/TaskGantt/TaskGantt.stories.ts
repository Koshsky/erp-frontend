import { ref, computed, watch } from 'vue'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TaskGantt from './TaskGantt.vue'

const now = new Date()
const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

function useTaskRange(start: number, end: number) {
  const s = ref(start)
  const e = ref(end)
  watch(s, (v) => { if (v >= e.value) e.value = v + 1 })
  watch(e, (v) => { if (v <= s.value) s.value = v - 1 })
  return { s, e }
}

const meta: Meta<typeof TaskGantt> = {
  title: 'Components/Gantt/TaskGantt',
  component: TaskGantt,
  parameters: { layout: 'padded' },
  render: () => ({
    components: { TaskGantt },
    setup() {
      const dayZero = ref(day(1))
      const totalDays = ref(20)
      const title = ref('Инсталляция')
      const projectCode = ref('KO-1001')
      const { s: s1, e: e1 } = useTaskRange(3, 8)
      const { s: s2, e: e2 } = useTaskRange(5, 12)
      const { s: s3, e: e3 } = useTaskRange(8, 16)

      const tasks = computed(() => [
        { id: 1, title: 'Разработка ППР',
          start_date: iso(day(Math.max(1, Math.min(s1.value, e1.value - 1)))),
          end_date: iso(day(Math.min(totalDays.value, Math.max(e1.value, s1.value + 1)))),
          resources: [{ resource_id: 1, quantity: 2, code: 'ПТО' }] },
        { id: 2, title: 'Закуп материалов',
          start_date: iso(day(Math.max(1, Math.min(s2.value, e2.value - 1)))),
          end_date: iso(day(Math.min(totalDays.value, Math.max(e2.value, s2.value + 1)))),
          resources: [{ resource_id: 5, quantity: 1, code: 'СВ' }] },
        { id: 3, title: 'Монтаж конструкций',
          start_date: iso(day(Math.max(1, Math.min(s3.value, e3.value - 1)))),
          end_date: iso(day(Math.min(totalDays.value, Math.max(e3.value, s3.value + 1)))),
          resources: [{ resource_id: 2, quantity: 3, code: 'МК' }] },
      ])

      const cols = computed(() => `180px repeat(${totalDays.value}, 1fr)`)

      return { tasks, dayZero, totalDays, title, projectCode, cols, s1, e1, s2, e2, s3, e3 }
    },
    template: `
      <div style="max-width:100%;font-family:sans-serif;">
        <div :style="{ display: 'grid', gridTemplateColumns: cols, background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
          <TaskGantt :dayZero="dayZero" :totalDays="totalDays" :title="title" :projectCode="projectCode" :tasks="tasks" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px;background:#f8f9fa;padding:16px;border-radius:8px;border:1px solid #e8e8e8;">
          <div>
            <div style="font-size:13px;font-weight:600;color:#444;margin-bottom:8px;">Разработка ППР</div>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Начало <input type="range" v-model.number="s1" :min="1" :max="e1-1" style="width:100%;"> {{ s1 }}</label>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Конец <input type="range" v-model.number="e1" :min="s1+1" :max="totalDays" style="width:100%;"> {{ e1 }}</label>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#444;margin-bottom:8px;">Закуп материалов</div>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Начало <input type="range" v-model.number="s2" :min="1" :max="e2-1" style="width:100%;"> {{ s2 }}</label>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Конец <input type="range" v-model.number="e2" :min="s2+1" :max="totalDays" style="width:100%;"> {{ e2 }}</label>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#444;margin-bottom:8px;">Монтаж конструкций</div>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Начало <input type="range" v-model.number="s3" :min="1" :max="e3-1" style="width:100%;"> {{ s3 }}</label>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Конец <input type="range" v-model.number="e3" :min="s3+1" :max="totalDays" style="width:100%;"> {{ e3 }}</label>
          </div>
        </div>
      </div>
    `,
  }),
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
