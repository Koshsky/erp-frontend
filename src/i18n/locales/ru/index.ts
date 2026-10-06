import app from './app'
import auth from './auth'
import changelog from './changelog'
import common from './common'
import header from './header'
import nav from './nav'

/**
 * Russian message catalog — the source of truth and the fallback locale. Keys
 * are the stable identifiers; locales/en carries the translations and is
 * type-checked against this shape. Domains are added wave by wave
 * (fields, perm, admin, planner, timesheet, offline, notify, errors, dates).
 */
export default {
  app,
  common,
  header,
  changelog,
  nav,
  auth,
} as const
