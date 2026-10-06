/**
 * English message catalog. Keys mirror ru.ts; missing keys fall back to the
 * Russian text (fallbackLocale in i18n/index.ts).
 */
import type ru from './ru'

type Translation<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends object ? Translation<T[K]> : never
}

export default {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    confirmTitle: 'Confirmation',
    dragHeaderTitle: 'Drag the header to reorder sections',
  },
  header: {
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
  },
  changelog: {
    title: 'Changelog',
    currentVersion: 'Current version:',
  },
  nav: {
    planner: 'Planner',
    projects: 'Projects',
    processes: 'Processes',
    tasks: 'Tasks',
    timesheet: 'Timesheet',
    employees: 'Employees',
    resources: 'Resources',
    admin: 'Admin',
    users: 'Users',
    structure: 'Company structure',
    autoCreate: 'Project auto-create trigger',
    statuses: 'Statuses',
    permissions: 'Permission presets',
    audit: 'Audit log',
    system: 'System',
    queue: 'Change queue',
    settings: 'Settings',
  },
  auth: {
    subtitle: 'Project Planning System',
    login: 'Login',
    password: 'Password',
    submit: 'Sign in →',
    submitWaiting: 'Please wait…',
    pingChecking: 'Checking connection…',
    pingOk: 'Server is reachable',
    pingFail: 'Server is unavailable',
    pingCheck: 'Check server connection',
    offlineHint: 'The server cannot verify the password — sign in offline below',
    offlineLogin: 'Sign in offline (no password check)',
    noSession: 'No saved session: sign in online at least once',
    fillAll: 'Fill in all fields',
    server: 'Server: {base}',
    settingsLink: '⚙ Server settings',
  },
} satisfies Translation<typeof ru>