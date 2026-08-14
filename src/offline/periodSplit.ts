/**
 * Разбиение периодов табеля с той же семантикой, что и бэкенд
 * (SetStateRange/DeleteStateRange + insertResidues): при наложении диапазона
 * [s, e] пересекающиеся интервалы НЕ удаляются целиком — из них вычитается
 * [s, e], а «хвосты» [a, s-1] и [e+1, b] сохраняются с исходным состоянием.
 * Покрытые полностью интервалы удаляются. PUT добавляет новый период [s, e].
 * Чистая функция без зависимостей — используется и в optimistic-обновлении
 * стора, и в write-through дельтах кэша (cacheApply).
 */

/** Период табеля (минимальный набор полей, нужных для разбиения) */
export interface DayPeriod {
  id?: number
  state_id?: number
  start_date?: string
  end_date?: string
  state_code?: string
  state_name?: string
  is_available?: boolean
}

/** Поля нового периода для PUT (ид + состояние) */
export interface PutPeriodFields {
  id?: number
  state_id: number
  state_code?: string
  state_name?: string
  is_available?: boolean
}

/** Дата YYYY-MM-DD через n дней от ISO-даты (локальная зона) */
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

function overlaps(p: DayPeriod, s: string, e: string): boolean {
  return p.start_date != null && p.end_date != null && !(p.end_date < s || p.start_date > e)
}

/**
 * Применяет PUT/DELETE диапазона [start, end] к списку периодов.
 *  - op='put': вычитает [s,e] из пересекающихся интервалов (сохраняя хвосты),
 *    покрытые удаляет, затем добавляет новый период putFields.
 *  - op='delete': то же вычитание без вставки; при stateId != null вырезает
 *    только интервалы указанного состояния (остальные не трогает).
 * Результат отсортирован по start_date.
 */
export function applyRangeSplit(
  periods: DayPeriod[],
  op: 'put' | 'delete',
  start: string,
  end: string,
  stateId?: number,
  putFields?: PutPeriodFields,
): DayPeriod[] {
  const out: DayPeriod[] = []
  for (const p of periods) {
    if (p.start_date == null || p.end_date == null || !overlaps(p, start, end)) {
      out.push(p)
      continue
    }
    // DELETE с фильтром по состоянию: чужие состояния не трогаем
    if (op === 'delete' && stateId != null && p.state_id != null && p.state_id !== stateId) {
      out.push(p)
      continue
    }
    if (p.start_date < start) {
      out.push({ ...p, end_date: shiftDate(start, -1) })
    }
    if (p.end_date > end) {
      out.push({ ...p, start_date: shiftDate(end, 1) })
    }
  }
  if (op === 'put' && putFields) {
    out.push({
      id: putFields.id,
      state_id: putFields.state_id,
      start_date: start,
      end_date: end,
      state_code: putFields.state_code,
      state_name: putFields.state_name,
      is_available: putFields.is_available,
    })
  }
  return out.sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
}
