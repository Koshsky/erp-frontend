# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The web app and the desktop wrapper (`desktop/`) are versioned together.

## [Unreleased]

### Changed

- Planning aggregates re-sync immediately after online mutations and on page entry; deleting a project instantly hides its processes and tasks everywhere, including the offline cache.
- User CRUD and hierarchy changes instantly refresh the roster, name catalogs and timesheet; "Employees"/"Timesheet" pages re-sync on entry.
- Default login preview in the "Create user" form uses the `surname.initials` format.
- Failed mutations surface through the bottom-left notification stack with a countdown timer.

## [1.0.0] - 2026-09-29

### Added

- Initial production release: planner Gantts, admin sections, offline-first data layer (IndexedDB cache, mutation outbox), themed UI, Electron desktop wrapper.

### Changed

- Users page: failed mutations show a visible error banner with the server message.