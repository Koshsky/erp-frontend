/** Maps backend machine-readable codes to local texts. */
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

/** Local text for an error code; null if the code is unknown. */
export function errorTextByCode(code?: string): string | null {
  if (!code) return null
  return CODE_MESSAGES[code] ?? null
}

/**
 * Human-readable error message from the { data, error } response body.
 * Priority: local text by code → backend message → fallback.
 */
export function apiErrorMessage(
  errorBody: { message?: string; code?: unknown } | null | undefined,
  fallback = 'Ошибка запроса',
): string {
  if (!errorBody) return fallback
  return errorTextByCode(errorBody.code != null ? String(errorBody.code) : undefined) ?? errorBody.message ?? fallback
}
