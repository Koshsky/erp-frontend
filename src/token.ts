/**
 * In-memory access token (AD-05): the access token lives only in process memory,
 * NOT in localStorage (XSS cannot read it). After a page reload the session is
 * restored via /auth/refresh using the HttpOnly cookie.
 */
let accessToken: string | null = null

export function getAccessToken(): string {
  return accessToken ?? ''
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}