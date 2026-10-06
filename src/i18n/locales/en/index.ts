import app from './app'
import auth from './auth'
import changelog from './changelog'
import common from './common'
import header from './header'
import nav from './nav'

/**
 * English message catalog. Keys mirror locales/ru; a missing key falls back to
 * the Russian text (fallbackLocale in i18n/index.ts), so an untranslated area
 * degrades gracefully instead of showing a key.
 */
export default {
  app,
  common,
  header,
  changelog,
  nav,
  auth,
} as const
