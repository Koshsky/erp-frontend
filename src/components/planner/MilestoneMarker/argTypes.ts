import type { ArgTypes } from '@storybook/vue3-vite'
import type { MilestoneMarkerProps } from './types'

export const milestoneMarkerArgTypes: ArgTypes<MilestoneMarkerProps> = {
  anchor: {
    name: 'Якорь шкалы',
    description: 'Опорная дата (первая ячейка) для расчёта позиции маркера',
    control: 'date',
    table: { type: { summary: 'Date | number' }, category: 'Data' },
  },
  mode: {
    name: 'Период',
    description: 'Период календаря: квартал (92 дня), полугодие или год',
    control: 'select',
    options: ['quarter', 'half', 'year'],
    table: { type: { summary: 'PlanningMode' }, defaultValue: { summary: 'quarter' }, category: 'Data' },
  },
  unit: {
    name: 'Единица ячейки',
    description: 'Сколько дней в одной ячейке шкалы: день или декада',
    control: 'select',
    options: ['day', 'decade'],
    table: { type: { summary: 'PlanningUnit' }, defaultValue: { summary: 'day' }, category: 'Data' },
  },
  date: {
    name: 'Дата вехи',
    description: 'Одна дата на шкале — маркер встаёт по центру её ячейки',
    control: 'date',
    table: { category: 'Data' },
  },
  title: {
    name: 'Заголовок',
    description: 'Первая строка тултипа',
    control: 'text',
    table: { category: 'Content' },
  },
  content: {
    name: 'Описание',
    description: 'Вторая строка тултипа (переносится на несколько строк)',
    control: 'text',
    table: { category: 'Content' },
  },
  color: {
    name: 'Цвет',
    control: 'color',
    table: { defaultValue: { summary: '#fbbc04' }, category: 'Appearance' },
  },
  variant: {
    name: 'Вид маркера',
    description: 'Полоска в пол-ячейки по центру или маркер на всю ширину ячейки',
    control: 'select',
    options: ['strip', 'cell'],
    table: { defaultValue: { summary: 'strip' }, category: 'Appearance' },
  },
}

export default milestoneMarkerArgTypes
