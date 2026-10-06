/**
 * Localization ratchet: user-visible Russian text must live in the message
 * catalogs (src/i18n/locales), not inline in components. This gate scans the
 * sources and fails on Cyrillic inside a string literal, a template text node
 * or an attribute value, so a translated area cannot silently regress.
 *
 * The scanner understands the file shapes of this codebase (Vue SFC blocks,
 * JS/TS comments, HTML comments) and ignores everything that is not user
 * visible: comments, style blocks, tests, Storybook docs and the catalog files
 * themselves. Cyrillic in a comment is a language-rule violation, not a
 * localization one, and is deliberately not part of this gate.
 *
 * PENDING is the rollout backlog: a file leaves the list in the same commit
 * that moves its strings into the catalog (stale entries fail the test, so the
 * list can only shrink).
 */
import { describe, expect, it } from 'vitest'

const CYRILLIC = /[\u0400-\u04FF]/

/**
 * All sources as raw text (Vite glob — no node APIs, so the test also runs in
 * the browser project). Keys are root-relative paths such as `/src/views/X.vue`.
 */
const SOURCES = import.meta.glob('/src/**/*.{ts,vue}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/** Files whose Cyrillic is functional data (not user-visible UI text). */
const EXCLUDED_FILES = new Set(['utils/translit.ts'])

/** Prefixed directories that never carry UI strings of this app. */
const EXCLUDED_PREFIXES = ['api/', 'i18n/locales/']

/** Reported paths are relative to src/. */
const PENDING: string[] = [
  "components/common/ColorField/ColorField.vue",
  "components/common/CopyField/CopyField.vue",
  "components/common/DataTable/DataTable.vue",
  "components/common/HintButton/HintButton.vue",
  "components/common/HintPanel/HintPanel.vue",
  "components/common/PasswordDialog/PasswordDialog.vue",
  "components/common/PasswordField/PasswordField.vue",
  "components/common/PendingMark/PendingMark.vue",
  "components/common/PlannerStates/PlannerStates.vue",
  "components/common/ResourceHeader/ResourceHeader.vue",
  "components/common/Tooltips/UsageTooltip.vue",
  "components/common/UsageCell/usageState.ts",
  "components/common/UserPermissionsEditor/labels.ts",
  "components/common/UserPermissionsEditor/UserPermissionsEditor.vue",
  "components/planner/Bar/Bar.vue",
  "components/planner/CalendarHeader/CalendarHeader.vue",
  "components/planner/dependencies.ts",
  "components/planner/MilestoneMarker/MilestoneMarker.vue",
  "components/planner/PdfExport/PdfExport.vue",
  "components/planner/PdfExport/pdfRenderer.ts",
  "components/planner/PdfExport/previewPdf.ts",
  "components/planner/ProcessPlanning/components/ProcessBar/ProcessBar.vue",
  "components/planner/ProjectPlanning/components/ProjectBar/ProjectBar.vue",
  "components/planner/ProjectPlanning/ProjectPlanning.vue",
  "components/planner/ResourceManagerModal/ResourceManagerModal.vue",
  "components/planner/ScaleBadge/ScaleBadge.vue",
  "components/planner/TaskComments/TaskComments.vue",
  "components/planner/TaskEditor/index.ts",
  "components/planner/TaskEditor/TaskEditor.vue",
  "components/planner/TaskPlanning/components/TaskGantt/components/TaskBar/TaskBar.vue",
  "components/timesheet/TimesheetCell/TimesheetCell.vue",
  "components/timesheet/TimesheetGrid/TimesheetGrid.vue",
  "composables/usePasswordValidation.ts",
  "composables/usePlanningOrigin.ts",
  "composables/useSyncStatus.ts",
  "config.ts",
  "http.ts",
  "offline/db.ts",
  "offline/outbox.ts",
  "offline/ReconnectToast.vue",
  "offline/SyncToast.vue",
  "offline/warmup.ts",
  "rbacScope.ts",
  "store/index.ts",
  "utils/apiError.ts",
  "utils/presets.ts",
  "views/AuditLogPage.vue",
  "views/AutoCreatePage.vue",
  "views/CompanyStructure.vue",
  "views/EmployeesPage.vue",
  "views/PermissionsPage.vue",
  "views/PlannerPage.vue",
  "views/ProcessesPage.vue",
  "views/ProfileEditPage.vue",
  "views/ProfilePage.vue",
  "views/ProjectsPage.vue",
  "views/ResourcesPage.vue",
  "views/ServerSettingsPage.vue",
  "views/StatusesPage.vue",
  "views/SystemConsolePage.vue",
  "views/SystemQueuePage.vue",
  "views/SystemSettingsPage.vue",
  "views/SystemStatusPage.vue",
  "views/TimesheetPage.vue",
  "views/UserAccessPage.vue",
  "views/UserFormPage.vue",
  "views/UsersPage.vue",
]

interface Hit {
  file: string
  line: number
  text: string
}

/** Scannable source files of src/ as «path → raw content» (path is relative to src/). */
function sourceFiles(): Map<string, string> {
  const out = new Map<string, string>()
  for (const [abs, raw] of Object.entries(SOURCES).sort(([a], [b]) => a.localeCompare(b))) {
    const rel = abs.replace(/^\/src\//, '')
    const name = rel.split('/').pop() ?? rel
    if (/\.(test|stories)\.ts$/.test(name) || name === 'argTypes.ts') continue
    if (EXCLUDED_FILES.has(rel) || EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue
    out.set(rel, raw)
  }
  return out
}

/** Records every Cyrillic string literal of a JS/TS snippet. */
function scanCode(code: string, file: string, startLine: number, hits: Hit[]): void {
  let i = 0
  let line = startLine
  while (i < code.length) {
    const c = code[i]
    if (c === '\n') {
      line += 1
      i += 1
      continue
    }
    if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && code[i + 1] === '*') {
      i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') line += 1
        i += 1
      }
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      const startLine = line
      let text = ''
      i += 1
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') {
          i += 2
          continue
        }
        if (code[i] === '\n') line += 1
        text += code[i]
        i += 1
      }
      i += 1
      if (CYRILLIC.test(text)) hits.push({ file, line: startLine, text: text.trim() })
      continue
    }
    i += 1
  }
}

/** Records Cyrillic in HTML text nodes and quoted attribute values. */
function scanMarkup(markup: string, file: string, startLine: number, hits: Hit[]): void {
  let i = 0
  let line = startLine
  let text = ''
  let textLine = line
  const flush = (): void => {
    if (CYRILLIC.test(text)) hits.push({ file, line: textLine, text: text.trim() })
    text = ''
  }
  while (i < markup.length) {
    const c = markup[i]
    if (c === '\n') line += 1
    if (c === '<') {
      if (markup.startsWith('<!--', i)) {
        flush()
        while (i < markup.length && !markup.startsWith('-->', i)) {
          if (markup[i] === '\n') line += 1
          i += 1
        }
        i += 3
        textLine = line
        continue
      }
      flush()
      // inside a tag: only quoted attribute values are user-visible text
      let attrLine = line
      i += 1
      while (i < markup.length && markup[i] !== '>') {
        if (markup[i] === '\n') line += 1
        if (markup[i] === '"' || markup[i] === "'") {
          const quote = markup[i]
          attrLine = line
          let value = ''
          i += 1
          while (i < markup.length && markup[i] !== quote) {
            value += markup[i]
            i += 1
          }
          i += 1
          if (CYRILLIC.test(value)) hits.push({ file, line: attrLine, text: value.trim() })
          continue
        }
        i += 1
      }
      i += 1
      textLine = line
      continue
    }
    if (text === '') textLine = line
    text += c
    i += 1
  }
  flush()
}

/** All Cyrillic UI text of one file (empty — clean). */
function scanFile(rel: string, raw: string): Hit[] {
  const lines = raw.split('\n')
  const hits: Hit[] = []
  if (!rel.endsWith('.vue')) {
    scanCode(raw, rel, 1, hits)
    return allowed(hits, lines)
  }
  // Vue SFC: scan <script> as code, <template> as markup, ignore <style>.
  const blocks = /<(script|template|style)\b[^>]*>([\s\S]*?)<\/\1>/g
  let match: RegExpExecArray | null
  while ((match = blocks.exec(raw)) !== null) {
    const kind = match[1]
    if (kind === 'style') continue
    const startLine = raw.slice(0, match.index).split('\n').length
    if (kind === 'script') scanCode(match[2], rel, startLine, hits)
    else scanMarkup(match[2], rel, startLine, hits)
  }
  return allowed(hits, lines)
}

/**
 * Drops the hits whose source line carries an `i18n-allow` marker — the
 * documented escape for intentionally Russian text: own-language language
 * names («Русский»), developer console logs and internal Error texts that never
 * reach a localized surface. Every marker carries a reason in its comment.
 */
function allowed(hits: Hit[], lines: string[]): Hit[] {
  return hits.filter((h) => !(lines[h.line - 1] ?? '').includes('i18n-allow'))
}

/** Files that still carry hardcoded Russian UI text, with the hit count. */
function offenders(): Map<string, number> {
  const out = new Map<string, number>()
  for (const [rel, raw] of sourceFiles()) {
    const hits = scanFile(rel, raw)
    if (hits.length > 0) out.set(rel, hits.length)
  }
  return out
}

describe('hardcoded user-visible text', () => {
  it('keeps Russian UI text out of the sources (catalog-only)', () => {
    const found = offenders()
    const unexpected = [...found.keys()].filter((f) => !PENDING.includes(f)).sort()
    const detail = unexpected.map((f) => `${f}: ${found.get(f)}`).join('\n')
    expect(detail).toBe('')
  })

  it('lists no file that is already fully localized', () => {
    const found = offenders()
    expect(PENDING.filter((f) => !found.has(f)).sort()).toEqual([])
  })
})
