import type ru from '../ru/header'
import type { Translation } from '../types'

export default {
  profile: 'Profile',
  themeToggle: 'Switch theme (currently {theme})',
  themeAria: 'Switch theme',
  themeLight: 'light',
  themeDark: 'dark',
  changelog: 'Changelog',
  language: 'Interface language',
  languageAuto: 'System language',
  logout: 'Sign out',
  menuShortcut: 'Menu (Ctrl+B)',
  menuOpen: 'Open menu',
  menuClose: 'Close menu',
} satisfies Translation<typeof ru>
