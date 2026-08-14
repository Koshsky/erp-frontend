import type { Meta, StoryObj } from '@storybook/vue3-vite'
import BarTooltip from './BarTooltip.vue'
import UsageTooltip from './UsageTooltip.vue'
import InfoTooltip from './InfoTooltip.vue'

const meta: Meta = {
  title: 'Components/Common/Tooltips',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj

/** Общий тултип объекта диаграммы (задача/проект/процесс/веха) с акцентами */
export const BarVariants: Story = {
  render: () => ({
    components: { BarTooltip },
    template: `
      <div style="font-family:sans-serif;display:grid;gap:16px;grid-template-columns:repeat(2,240px);align-items:start;">
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Задача</div>
          <BarTooltip title="Монтаж конструкций" :accent="'#34a853'" :rows="['18.07.2026 — 07.08.2026']" :resources="[{label:'Монтажник',quantity:3},{label:'Инженер',quantity:1}]" /></div>
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Проект</div>
          <BarTooltip title="Склад-Логистика" :accent="'#1a73e8'" :rows="['Приоритет: высокий','Владелец: Иванов','01.08.2026 — 20.09.2026']" /></div>
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Процесс</div>
          <BarTooltip title="Инсталляция" :accent="'#1a73e8'" :rows="['Владелец: Петров','01.08.2026 — 10.08.2026']" /></div>
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Веха</div>
          <BarTooltip title="Этап №1" :accent="'#fbbc04'" :rows="['Сдача отчётности','05.09.2026']" /></div>
      </div>
    `,
  }),
}

/** Тултип загрузки ресурсов по состояниям */
export const UsageVariants: Story = {
  render: () => ({
    components: { UsageTooltip },
    template: `
      <div style="font-family:sans-serif;display:grid;gap:16px;grid-template-columns:repeat(2,220px);align-items:start;">
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Норма</div><UsageTooltip :used="3" :available="5" /></div>
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Перегруз</div><UsageTooltip :used="7" :available="5" /></div>
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Критично</div><UsageTooltip :used="10" :available="5" /></div>
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Нет данных</div><UsageTooltip :used="2" :available="null" /></div>
      </div>
    `,
  }),
}

/** Простые подсказки: лейблы, табельные состояния, инструкции */
export const InfoVariants: Story = {
  render: () => ({
    components: { InfoTooltip },
    template: `
      <div style="font-family:sans-serif;display:grid;gap:16px;grid-template-columns:repeat(2,220px);align-items:start;">
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Состояние табеля</div>
          <InfoTooltip title="Отпуск" :lines="['20.07.2026 — 02.08.2026']" marker="#1e88e5" /></div>
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Сотрудник</div>
          <InfoTooltip title="Иванов Иван" :lines="['Инженер ПТО']" /></div>
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Ресурс</div>
          <InfoTooltip title="Монтажник" :lines="['Всего: 12 человек']" /></div>
        <div><div style="font-size:12px;color:#888;margin-bottom:4px;">Инструкция</div>
          <InfoTooltip :lines="['Перетащить для смены приоритета']" /></div>
      </div>
    `,
  }),
}
