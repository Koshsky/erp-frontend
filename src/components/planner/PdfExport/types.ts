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
}
