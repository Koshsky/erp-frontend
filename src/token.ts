/**
 * In-memory access token (AD-05): access-токен живёт только в памяти процесса,
 * НЕ в localStorage (XSS не сможет его прочитать). После перезагрузки страницы
 * сессия восстанавливается через /auth/refresh по HttpOnly-куке.
 */
let accessToken: string | null = null

export function getAccessToken(): string {
  return accessToken ?? ''
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}