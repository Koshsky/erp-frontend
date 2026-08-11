import type { PlanningUnit } from '../calendar'

export interface PdfExportTaskResource {
  id?: number
  code?: string
  title?: string
  quantity?: number
}

export interface PdfExportTask {
  id?: number
  title?: string
  start_date?: string
  end_date?: string
  resources?: PdfExportTaskResource[]
}

export interface PdfExportMilestone {
  id?: number
  title?: string
  date?: string
}

/** Ресурс для блока занятости (DTO /resources) — без импорта @/api */
export interface PdfExportResource {
  id?: number
  code?: string
  title?: string
}

/** Период доступности (DTO /timesheet/calendar) */
export interface PdfExportResourcePeriod {
  start_date?: string
  end_date?: string
  available?: number
}

/** Запись календаря доступности ресурса (DTO /timesheet/calendar) */
export interface PdfExportResourceCalendar {
  resource_id?: number
  periods?: PdfExportResourcePeriod[]
}

/** Структурный тип процесса (DTO /planning/tasks) — без импорта @/api */
export interface PdfExportProcess {
  id?: number
  title?: string
  project_id?: number
  project_code?: string
  start_date?: string
  end_date?: string
  owner_id?: number | null
  tasks?: PdfExportTask[]
  milestones?: PdfExportMilestone[]
}

export interface PdfExportProps {
  /** Процессы страницы задач в порядке отображения (как на экране) */
  processes?: PdfExportProcess[] | null
  /** Якорь шкалы: ячейка с индексом 0 (начальная позиция) */
  origin?: Date | string
  /** Единица ячейки: день или декада */
  unit?: PlanningUnit
  /** Заголовок в колонтитуле PDF */
  pageTitle?: string
  /** Id текущего пользователя — для фильтра «Только мои процессы» */
  ownerId?: number | null
  /** Начало печатного периода — видимое окно шкалы со страницы (ISO YYYY-MM-DD) */
  periodFrom?: string | null
  /** Конец печатного периода — видимое окно шкалы со страницы (ISO YYYY-MM-DD) */
  periodTo?: string | null
  /** Масштаб печати: зум страницы (Ctrl+wheel) — множитель плотности контента */
  scale?: number | null
  /** Ресурсы для блока занятости (ResourceHeader) в печати */
  resources?: PdfExportResource[] | null
  /** Календарь доступности ресурсов (/timesheet/calendar) — для ResourceHeader */
  calendar?: PdfExportResourceCalendar[] | null
}
