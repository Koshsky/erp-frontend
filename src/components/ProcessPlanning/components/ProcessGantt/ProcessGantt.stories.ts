import { ref, computed, watch } from 'vue'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ProcessGantt from './ProcessGantt.vue'

const now = new Date()
const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

function useRange(s: number, e: number) {
  const a = ref(s); const b = ref(e)
  watch(a, (v) => { if (v >= b.value) b.value = v + 1 })
  watch(b, (v) => { if (v <= a.value) a.value = v - 1 })
  return { s: a, e: b }
}

const meta: Meta<typeof ProcessGantt> = {
  title: 'Components/Gantt/ProcessGantt',
  component: ProcessGantt,
  parameters: { layout: 'padded' },
  render: () => ({
    components: { ProcessGantt },
    setup() {
      const dayZero = ref(day(1))
      const totalDays = ref(60)
      const projectCode = ref('КО-1234')
      const { s: s1, e: e1 } = useRange(1, 35)
      const { s: s2, e: e2 } = useRange(20, 55)

      const processes = computed(() => [
        { id: 1, title: 'Производство', start_date: iso(day(s1.value)), end_date: iso(day(e1.value)) },
        { id: 2, title: 'Инсталляция', start_date: iso(day(s2.value)), end_date: iso(day(e2.value)) },
      ])

      const cols = computed(() => `180px repeat(${totalDays.value}, 1fr)`)

      return { processes, dayZero, totalDays, projectCode, cols, s1, e1, s2, e2 }
    },
    template: `
      <div style="max-width:100%;font-family:sans-serif;">
        <div :style="{ display: 'grid', gridTemplateColumns: cols, background: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', overflowX: 'auto', minWidth: '600px' }">
          <ProcessGantt :dayZero="dayZero" :totalDays="totalDays" :projectCode="projectCode" :processes="processes" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;background:#f8f9fa;padding:16px;border-radius:8px;border:1px solid #e8e8e8;">
          <div>
            <div style="font-size:13px;font-weight:600;color:#444;margin-bottom:8px;">Производство</div>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Нач <input type="range" v-model.number="s1" :min="1" :max="e1-1" style="width:100%;">{{ s1 }}</label>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Кон <input type="range" v-model.number="e1" :min="s1+1" :max="totalDays" style="width:100%;">{{ e1 }}</label>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#444;margin-bottom:8px;">Инсталляция</div>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Нач <input type="range" v-model.number="s2" :min="1" :max="e2-1" style="width:100%;">{{ s2 }}</label>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;">Кон <input type="range" v-model.number="e2" :min="s2+1" :max="totalDays" style="width:100%;">{{ e2 }}</label>
          </div>
        </div>
      </div>
    `,
  }),
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

