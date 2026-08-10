/** Маппинг machine-readable кодов бэкенда на локальные тексты. */
const CODE_MESSAGES: Record<string, string> = {
  BAD_REQUEST: 'Некорректный запрос',
  UNAUTHORIZED: 'Требуется авторизация',
  FORBIDDEN: 'Недостаточно прав',
  NOT_FOUND: 'Объект не найден',
  TOO_MANY_REQUESTS: 'Слишком много запросов, повторите позже',
  INVALID_CREDENTIALS: 'Неверный логин или пароль',
  INVALID_TOKEN: 'Сессия истекла, войдите заново',
  VALIDATION_ERROR: 'Проверьте корректность данных',
  INTERNAL_ERROR: 'Внутренняя ошибка сервера',
}

/** Локальный текст по коду ошибки; null, если код неизвестен. */
export function errorTextByCode(code?: string): string | null {
  if (!code) return null
  return CODE_MESSAGES[code] ?? null
}

/**
 * Человекочитаемое сообщение об ошибке из тела ответа { data, error }.
 * Приоритет: локальный текст по коду → сообщение бэкенда → fallback.
 */
export function apiErrorMessage(
  errorBody: { message?: string; code?: unknown } | null | undefined,
  fallback = 'Ошибка запроса',
): string {
  if (!errorBody) return fallback
  return errorTextByCode(errorBody.code != null ? String(errorBody.code) : undefined) ?? errorBody.message ?? fallback
}
