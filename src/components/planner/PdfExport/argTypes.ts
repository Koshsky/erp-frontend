import type { ArgTypes } from '@storybook/vue3-vite'
import type { PdfExportProps } from './types'

export const pdfExportArgTypes: ArgTypes<PdfExportProps> = {
  processes: {
    name: 'Процессы',
    description: 'Процессы страницы задач в порядке отображения (DTO /planning/tasks)',
    control: false,
    table: { type: { summary: 'PdfExportProcess[]' }, category: 'Data' },
  },
  origin: {
    name: 'Якорь шкалы',
    description: 'Дата-якорь: ячейка с индексом 0 (начальная позиция шкалы)',
    control: 'text',
    table: { type: { summary: 'string' }, defaultValue: { summary: "''" }, category: 'Data' },
  },
  unit: {
    name: 'Единица ячейки',
    description: 'Единица ячейки шкалы: день или декада',
    control: { type: 'select' },
    options: ['day', 'decade'],
    table: { type: { summary: 'PlanningUnit' }, defaultValue: { summary: 'day' }, category: 'Data' },
  },
  pageTitle: {
    name: 'Заголовок PDF',
    description: 'Заголовок в колонтитуле печатаемого PDF',
    control: 'text',
    table: { type: { summary: 'string' }, defaultValue: { summary: 'Диаграмма задач' }, category: 'Data' },
  },
  ownerId: {
    name: 'Id пользователя',
    description: 'Id текущего пользователя — владелец процессов для фильтра «Только мои процессы»',
    control: 'number',
    table: { type: { summary: 'number' }, category: 'Data' },
  },
  periodFrom: {
    name: 'Период: начало',
    description: 'Начало печатного периода — видимое окно шкалы со страницы (ISO YYYY-MM-DD)',
    control: 'text',
    table: { type: { summary: 'string' }, category: 'Data' },
  },
  periodTo: {
    name: 'Период: конец',
    description: 'Конец печатного периода — видимое окно шкалы со страницы (ISO YYYY-MM-DD)',
    control: 'text',
    table: { type: { summary: 'string' }, category: 'Data' },
  },
  scale: {
    name: 'Масштаб печати',
    description: 'Зум страницы (Ctrl+wheel): множитель плотности контента (шрифты, строки, бары)',
    control: { type: 'range', min: 0.25, max: 4, step: 0.25 },
    table: { type: { summary: 'number' }, defaultValue: { summary: '1' }, category: 'Data' },
  },
  resources: {
    name: 'Ресурсы',
    description: 'Ресурсы для блока занятости (ResourceHeader) в печати',
    control: false,
    table: { type: { summary: 'PdfExportResource[]' }, category: 'Data' },
  },
  calendar: {
    name: 'Календарь доступности',
    description: 'Периоды доступности ресурсов (/timesheet/calendar) — учитывают табель и даты нанят/уволен',
    control: false,
    table: { type: { summary: 'PdfExportResourceCalendar[]' }, category: 'Data' },
  },
}

export default pdfExportArgTypes
