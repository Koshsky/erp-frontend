import type { Meta, StoryObj } from '@storybook/vue3-vite'
import MilestoneMarker from './MilestoneMarker.vue'

const now = new Date()
const y = now.getFullYear()
const day = (m: number, d: number) => new Date(y, m - 1, d)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const meta: Meta<typeof MilestoneMarker> = {
  title: 'Components/Planner/MilestoneMarker',
  component: MilestoneMarker,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

function withMilestone(props: Record<string, any>): Story['render'] {
  return () => ({
    components: { MilestoneMarker },
    data: () => ({ anchor: day(1, 1), mode: 'quarter' as const, unit: 'day' as const, ...props }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;height:36px;background:#f0f0f0;border-radius:6px;">
          <MilestoneMarker
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
            :date="date"
            :title="title"
            :content="content"
            :color="color"
          />
        </div>
      </div>
    `,
  })
}

/** Полоска в половину ширины ячейки по центру; в тултипе — заголовок и описание */
export const Default: Story = {
  render: withMilestone({
    date: iso(day(2, 12)),
    title: 'Сдача ППР',
    content: 'Утверждение проекта производства работ заказчиком',
  }),
}

/** Веха без описания — тултип показывает только заголовок */
export const TitleOnly: Story = {
  render: withMilestone({
    date: iso(day(2, 20)),
    title: 'Начало монтажа',
  }),
}

/** Длинное описание переносится на несколько строк в тултипе */
export const LongContent: Story = {
  render: withMilestone({
    date: iso(day(3, 5)),
    title: 'Подписание акта выполненных работ',
    content:
      'Проверка объёмов выполненных работ, сверка фактических затрат со сметой и подписание акта КС-2 представителями заказчика, подрядчика и технадзора.',
  }),
}

/** Маркер по центру ячейки с лучом-древком вниз через строки до низа блока */
export const WithRay: Story = {
  render: () => ({
    components: { MilestoneMarker },
    data: () => ({
      anchor: day(1, 1),
      mode: 'quarter' as const,
      unit: 'day' as const,
      milestones: [
        { date: iso(day(1, 15)), title: 'КП согласовано', content: 'Коммерческое предложение принято заказчиком' },
        { date: iso(day(2, 8)), title: 'Старт монтажа', content: 'Выход бригады на объект', color: '#1a73e8' },
        { date: iso(day(3, 18)), title: 'Окончание работ', content: 'Финал монтажа, подготовка к приёмке', color: '#188038' },
      ],
    }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;background:#fff;border:1px solid #e8e8e8;border-radius:6px;">
          <div style="height:36px;background:#f0f0f0;border-bottom:1px solid #e8e8e8;"></div>
          <div v-for="i in 3" :key="i" style="height:36px;border-bottom:1px solid #e8e8e8;background:#fff;"></div>
          <MilestoneMarker
            v-for="ms in milestones"
            :key="ms.date"
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
            :date="ms.date"
            :title="ms.title"
            :content="ms.content"
            :color="ms.color"
            :headerHeight="36"
          />
        </div>
      </div>
    `,
  }),
}

/** Полугодие, дневные ячейки — маркер по центру ячейки 15 апреля */
export const HalfYear: Story = {
  render: withMilestone({
    anchor: day(1, 1),
    mode: 'half',
    unit: 'day',
    date: iso(day(4, 15)),
    title: 'Первый транш',
    content: 'Поступление авансового платежа',
    color: '#188038',
  }),
}

/** Год, декады — маркер встаёт по центру ячейки-декады (20 марта) */
export const DecadeUnit: Story = {
  render: withMilestone({
    anchor: day(1, 1),
    mode: 'year',
    unit: 'decade',
    date: iso(day(3, 20)),
    title: 'Завершение этапа',
    content: 'Окончание закупочной кампании',
    color: '#1a73e8',
  }),
}

/** Несколько вех на одной дорожке в пределах квартала */
export const MultipleMilestones: Story = {
  render: () => ({
    components: { MilestoneMarker },
    data: () => ({
      anchor: day(1, 1),
      mode: 'quarter' as const,
      unit: 'day' as const,
      milestones: [
        { date: iso(day(1, 15)), title: 'КП согласовано', content: 'Коммерческое предложение принято заказчиком' },
        { date: iso(day(2, 1)), title: 'Старт монтажа', content: 'Выход бригады на объект' },
        { date: iso(day(2, 25)), title: 'Поставка металла', content: 'Приёмка партии по накладной № 42' },
        { date: iso(day(3, 18)), title: 'Окончание работ', content: 'Финал монтажа, подготовка к приёмке', color: '#188038' },
      ],
    }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;">
        <div style="position:relative;width:100%;height:36px;background:#f0f0f0;border-radius:6px;">
          <MilestoneMarker
            v-for="ms in milestones"
            :key="ms.date"
            :anchor="anchor"
            :mode="mode"
            :unit="unit"
            :date="ms.date"
            :title="ms.title"
            :content="ms.content"
            :color="ms.color"
          />
        </div>
      </div>
    `,
  }),
}

/** Даты вне календарной шкалы (до якоря / после периода) — маркер не отображается */
export const OutOfRange: Story = {
  render: () => ({
    components: { MilestoneMarker },
    data: () => ({
      anchor: day(1, 1),
      mode: 'quarter' as const,
      unit: 'day' as const,
      before: iso(new Date(y - 1, 11, 20)),
      after: iso(day(5, 10)),
    }),
    template: `
      <div style="max-width:800px;margin:0 auto;font-family:sans-serif;display:flex;flex-direction:column;gap:14px;">
        <div style="font-size:13px;font-weight:600;color:#666;">Дата до якоря (декабрь прошлого года) — не отображается</div>
        <div style="position:relative;width:100%;height:36px;background:#f0f0f0;border-radius:6px;">
          <MilestoneMarker :anchor="anchor" :mode="mode" :unit="unit" :date="before" title="Вне шкалы" content="Маркер скрыт" color="#ea4335" />
        </div>
        <div style="font-size:13px;font-weight:600;color:#666;">Дата после периода (май) — не отображается</div>
        <div style="position:relative;width:100%;height:36px;background:#f0f0f0;border-radius:6px;">
          <MilestoneMarker :anchor="anchor" :mode="mode" :unit="unit" :date="after" title="Вне шкалы" content="Маркер скрыт" color="#ea4335" />
        </div>
      </div>
    `,
  }),
}
