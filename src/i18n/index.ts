import { createI18n } from 'vue-i18n'
import { watch } from 'vue'
import { uiLanguage } from '../settings'
import ru from './locales/ru'
import en from './locales/en'

/**
 * App-wide localization (RU/EN). The Russian catalog is the source of truth
 * and the fallback: keys without a translation render the Russian text, so
 * untranslated parts of the app keep working. The locale follows the
 * interface-language setting (see settings.ts: uiLanguage).
 */
export const i18n = createI18n({
  legacy: false,
  locale: uiLanguage.value === 'auto' ? detectBrowserLanguage() : uiLanguage.value,
  fallbackLocale: 'ru',
  messages: { ru, en },
})

/** Best-effort browser detection for the "auto" mode (en → English, else Russian). */
export function detectBrowserLanguage(): 'ru' | 'en' {
  try {
    return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ru'
  } catch {
    return 'ru'
  }
}

/** Global translator: `t('header.profile')` etc. (composition-mode global). */
export const t = i18n.global.t

/** Switches the active locale (used by the settings watcher). */
export function setAppLocale(locale: 'ru' | 'en'): void {
  i18n.global.locale.value = locale
  try {
    // keep the html lang attribute in sync for accessibility
    document.documentElement.lang = locale
  } catch {
    // non-browser environment (tests)
  }
}

watch(uiLanguage, (v) => setAppLocale(v === 'auto' ? detectBrowserLanguage() : v), { immediate: true })