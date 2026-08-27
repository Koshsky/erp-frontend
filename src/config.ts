/**
 * Runtime-конфигурация приложения.
 *
 * Полный URL API складывается из «базового адреса сервера» (куда пользователь
 * обращается, например https://localhost или https://erp.example.ru) и
 * суффикса /api/v1. По умолчанию берётся из VITE_API_URL (build), но может
 * быть переопределён в рантайме (экран настроек до входа / экран
 * синхронизации). Override хранится в localStorage (mvs_erp_api_url) и
 * переживает перезагрузки.
 *
 * Смена адреса — только для настольной (Electron) сборки. В браузерной версии
 * SPA и API живут на одном origin (nginx-прокси /api/v1), CSP
 * «connect-src 'self'» блокирует кросс-ориджин, а refresh-кука (HttpOnly,
 * SameSite=Strict) не переживает смену origin, поэтому override в вебе
 * игнорируется и не сохраняется (см. также ServerSettingsPage/SyncPage).
 */

import { isElectron } from './electron'

const API_URL_KEY = 'mvs_erp_api_url'

/** Постоянный суффикс API-эндпоинтов бэкенда. */
const API_PREFIX = '/api/v1'

/** Текущий override (в памяти) — чтобы не читать localStorage на каждый запрос */
let override: string | null = null

// В вебе устаревший override (например, остался от десктоп-сессии в том же
// браузерном профиле) не должен влиять на приложение — сразу чистим.
if (!isElectron) {
  override = null
  try {
    localStorage.removeItem(API_URL_KEY)
  } catch {
    // ключа нет — ок
  }
}

function isValidApiUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function readStored(): string | null {
  try {
    const raw = localStorage.getItem(API_URL_KEY)
    return raw && isValidApiUrl(raw) ? raw : null
  } catch {
    return null
  }
}

/**
 * Базовый URL API для API-клиентов: runtime-переопределение, либо env.
 * undefined — клиенты сами откатятся на встроенный default (как было).
 */
export function getApiUrl(): string | undefined {
  // Override (смена сервера) — только в настольной сборке; в вебе адрес
  // всегда берётся из env (same-origin nginx-прокси).
  const stored = isElectron ? (override ?? readStored()) : null
  if (stored) return stored.replace(/\/+$/, '')
  const env = import.meta.env.VITE_API_URL
  return env ? env.replace(/\/+$/, '') : undefined
}

/**
 * Базовый адрес сервера (без суффикса /api/v1) для показа в поле настроек.
 * Например: https://localhost / https://erp.example.ru.
 */
export function getServerBase(): string {
  const api = getApiUrl()
  if (!api) return ''
  // Если в сохранённом уже есть /api/v1 — убираем его для показа базы.
  return api.replace(API_PREFIX + '$', '').replace(/\/+$/, '')
}

/**
 * Нормализует введённый пользователем адрес сервера в полный URL API:
 *  - убирает хвостовые слэши и пробелы;
 *  - добавляет /api/v1, если его ещё нет (чтобы не зависеть от ввода).
 * Возвращает null, если адрес не является http(s)://host.
 */
export function normalizeServerToApiUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!isValidApiUrl(trimmed)) return null
  if (trimmed.endsWith(API_PREFIX)) return trimmed
  return `${trimmed}${API_PREFIX}`
}

/**
 * Устанавливает адрес сервера из базового ввода (автодобавляет /api/v1).
 * persist=true сохраняет в localStorage. Возвращает false при невалидном URL.
 */
export function setServerBase(input: string, persist: boolean): boolean {
  if (!isElectron) return false
  const full = normalizeServerToApiUrl(input)
  if (!full) return false
  return setApiUrl(full, persist)
}

/**
 * Устанавливает runtime URL API (полный, уже с /api/v1 при необходимости).
 * persist=true сохраняет в localStorage; иначе живёт только в памяти сессии.
 * Возвращает false, если URL некорректен (не http(s)).
 */
export function setApiUrl(url: string, persist: boolean): boolean {
  if (!isElectron) return false
  const full = normalizeServerToApiUrl(url)
  if (!full) return false
  override = full
  try {
    if (persist) localStorage.setItem(API_URL_KEY, full)
    else localStorage.removeItem(API_URL_KEY)
  } catch {
    // настройки не критичны — остаётся override в памяти
  }
  return true
}

/** Сбрасывает override — приложение возвращается к VITE_API_URL */
export function resetApiUrl(): void {
  override = null
  try {
    localStorage.removeItem(API_URL_KEY)
  } catch {
    // ignore
  }
}

/** Есть ли сохранённый runtime-URL (для показа «используется override») */
export function hasApiUrlOverride(): boolean {
  return isElectron && Boolean(override ?? readStored())
}

/** Предупреждение при http-схеме для не-loopback-хоста: Secure-кука refresh
 *  не сохраняется/не уходит, вход и автосинк могут не работать. Для
 *  localhost/127.0.0.1 — null (локальная разработка). */
export function httpSchemeWarning(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:') return null
    const host = u.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null
    return 'Сервер по http: сессия и автосинк (refresh) могут не работать — используйте https'
  } catch {
    return null
  }
}
