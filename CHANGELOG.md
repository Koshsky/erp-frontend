# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The web app and the desktop wrapper (`desktop/`) are versioned together.

## [1.0.0] - 2026-09-29

### Added

- Initial production release of the MVS ERP frontend:
  - Vue 3 + TypeScript + Vite + Pinia + Vue Router app built around the
    planner (Gantt) and admin sections (users, permissions, auto-create,
    system pages).
  - Offline-first data layer: IndexedDB cache, outbox for offline mutations,
    reconnect/sync toasts, no-TTL local storage.
  - Themed UI tokens (default/compact/minimal, light/dark), hint system,
    Storybook component library with Vitest stories.
  - Electron desktop wrapper (`desktop/`) around the same build.
- Versioning: web and desktop pinned to SemVer `1.0.0`; release tags on
  `main` flow into Docker Hub images (`koshsky/erp-frontend:v1.0.0`).

### Changed

- Users page: failed mutations (e.g. deletion blocked by referenced records)
  now show a visible error banner with the server message instead of failing
  silently.