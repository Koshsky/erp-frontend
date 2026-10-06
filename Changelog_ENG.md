# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The web app and the desktop wrapper are versioned together.

## [1.2.0] - 2026-10-06

### Changed

- Navigation of planner tables, the timesheet and DataTable tables now uses middle mouse button drag instead of the left one; the drag starts from any point of the table — bars, milestones and headers never block moving it.
- Tables with drag navigation keep the plain arrow cursor at rest (headers, rows, empty space); Gantt bars show a clickable pointer; while the middle button is held, the cursor globally turns into the grabbing fist.
- Weekday labels in the calendar header raised by a couple of pixels.
- Presets have three editable fields — name, tag (access code) and description — set on creation and changeable later; lists and selects show the preset name.
- The preset tooltip shows its description.
- Action notifications (saving, preset create/rename/delete, password change, sync) moved into the notification stack instead of colored text at the top of the page.
- Action button panels are aligned to the right edge so the notification stack cannot cover them.
- Diagram settings: default duration of a created project, in days.
- A changelog icon in the header opens the changelog (Changelog_RU.md) in a centered dialog.

## [1.1.0] - 2026-10-01

### Changed

- Tables (statuses, users, employees, resources, audit log, company structure) now use a shared table component: full-width card with an actions toolbar, sortable column headers, per-column filters sitting right under each header (underline style), expandable rows, horizontal scrolling for wide tables, and user-adjustable column widths (drag the header edge; widths are remembered per user; double-click resets a column to auto width).
- Interface settings on the Settings page: notification stack on/off and auto-hide time (3–10 s or never), light/dark/system theme, UI font size (small/default/large), and table page size (25/50/100); the employees roster gained separate "Position", "Resource" and "Resource owner" columns with their own filters.
- The Settings page is organized into switchable sections (Interface, Tables, Diagrams, Sync, Connection) with a segmented control; setting cards are width-capped.
- Settings: the "Clear local data" option removed.
- Hints are now Markdown files (`*.md` assets); the hint panel renders them through a dedicated safe Markdown view with a new `MarkdownView` component.

### Fixed

- Resources page: the list now refreshes from the network on page entry, so it no longer stays empty until a re-login when the cache is empty on a cold start (background sync disabled).
- Tasks page: the "Save to PDF" and help buttons are vertically centered in the toolbar with a small gap between them; the help button is now a rounded square.
- Mobile: the navigation drawer can now be closed again (scrim tap, menu item tap, browser back).

## [1.0.2] - 2026-09-30

### Added

- Sidebar icons are sourced from a bundled Lucide catalog (one glyph per section).
- Sidebar icons can be overridden at runtime by dropping custom SVG files into the mounted `assets/custom/icons` directory (no rebuild).
- States support a custom color: shown in the statuses list, the timesheet legend, the assignment panel and the day cells.
- User editor: resetting a password shows the newly generated password once.
- Audit page: when the backend journal is disabled, a help card explains how to enable it instead of a raw 404 error.
- Users page: sortable "Preset" column with Russian preset labels.
- Preset names accept letters of any script (cyrillic included); preset create/rename modals show local validation errors again.
- Profile page: connection status and app/version cards.

### Changed

- "Console" and "Status" tabs removed from the sidebar (the pages stay reachable by URL).
- Access editor highlights a row only while the frontend draft differs from the backend state.
- Settings page: per-domain warm-up toggles removed, tiles spaced tighter.
- User create/edit form: the cancel button is now "Back".
- Failed mutations are no longer rendered inline on pages — the toast stack is the single notification channel.

## [1.0.1] - 2026-09-30

### Changed

- Planning aggregates re-sync immediately after online mutations and on page entry; deleting a project instantly hides its processes and tasks everywhere, including the offline cache.
- User CRUD and hierarchy changes instantly refresh the roster, name catalogs and timesheet; "Employees"/"Timesheet" pages re-sync on entry.
- Default login preview in the "Create user" form uses the `surname.initials` format.
- Failed mutations surface through the bottom-left notification stack with a countdown timer.

### Fixed

- A broken custom hint no longer shadows the built-in hint with the same file name — the built-in page is kept.

## [1.0.0] - 2026-09-29

### Added

- Initial production release: planner Gantts, admin sections, offline-first data layer (IndexedDB cache, mutation outbox), themed UI, Electron desktop wrapper.

### Changed

- Users page: failed mutations show a visible error banner with the server message.