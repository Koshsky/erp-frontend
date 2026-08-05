import type { Meta, StoryObj } from '@storybook/vue3-vite'
import MilestoneMarker from './MilestoneMarker.vue'
import { makeDemoTimeline } from '@/components/planner/plannerStoryHelpers'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const meta: Meta<typeof MilestoneMarker> = {
  title: 'Components/Planner/MilestoneMarker',
  component: MilestoneMarker,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => ({
    components: { MilestoneMarker },
    data: () => ({ timeline: makeDemoTimeline(iso(day(1, 1)), 'day') }),
    template: `
      <div style="max-width:760px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:3000px;height:36px;background:#f0f0f0;border-radius:6px;overflow:hidden;">
          <MilestoneMarker :timeline="timeline" :date="iso(day(2,12))" title="Сдача ППР" content="Утверждение ППР заказчиком" />
          <MilestoneMarker :timeline="timeline" :date="iso(day(2,20))" title="Начало монтажа" color="#1a73e8" />
          <MilestoneMarker :timeline="timeline" :date="iso(day(3,18))" title="Окончание работ" content="Финал монтажа" color="#188038" />
        </div>
        <div style="font-size:12px;color:#666;margin-top:6px;">Флажки по центру своих ячеек (16 февраля, 20 февраля, 18 марта).</div>
      </div>
    `,
  }),
}

export const WithRay: Story = {
  render: () => ({
    components: { MilestoneMarker },
    data: () => ({
      timeline: makeDemoTimeline(iso(day(1, 1)), 'day'),
      milestones: [
        { date: iso(day(1, 15)), title: 'КП согласовано' },
        { date: iso(day(2, 8)), title: 'Старт монтажа', color: '#1a73e8' },
        { date: iso(day(3, 18)), title: 'Окончание работ', color: '#188038' },
      ],
    }),
    template: `
      <div style="max-width:760px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:3000px;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
          <div style="height:20px;background:#fff8e1;border-bottom:1px solid #f0e6c8;"></div>
          <div v-for="i in 3" :key="i" style="height:36px;border-bottom:1px solid #e8e8e8;background:#fff;"></div>
          <MilestoneMarker v-for="ms in milestones" :key="ms.date" :timeline="timeline" :date="ms.date" :title="ms.title" :color="ms.color" :stripHeight="20" :draggable="false" />
        </div>
      </div>
    `,
  }),
}

export const DecadeUnit: Story = {
  render: () => ({
    components: { MilestoneMarker },
    data: () => ({ timeline: makeDemoTimeline(iso(day(1, 1)), 'decade') }),
    template: `
      <div style="max-width:760px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:3000px;height:36px;background:#f0f0f0;border-radius:6px;overflow:hidden;">
          <MilestoneMarker :timeline="timeline" :date="iso(day(3,20))" title="Завершение этапа" content="Окончание закупочной кампании" color="#1a73e8" :draggable="false" />
        </div>
        <div style="font-size:12px;color:#666;margin-top:6px;">Декада: маркер по центру ячейки-декады (март, 21–31).</div>
      </div>
    `,
  }),
}
