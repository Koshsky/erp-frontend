/**
 * Matrix tests for the RBAC scope-expression evaluator (src/rbacScope.ts).
 * Mirrors the backend semantics (scopeexpr.go/eval.go): legacy zones, the
 * move vocabulary, the chain evaluation and the probe-dependent moves.
 */
import { describe, expect, it } from 'vitest'
import {
  canonicalScope,
  parseScopeExpr,
  isValidScopeExpr,
  describeScopeExpr,
  evalScope,
  scopeMoves,
  toggleScopeMove,
} from './rbacScope'

describe('parseScopeExpr', () => {
  it('canonicalizes legacy zones', () => {
    expect(parseScopeExpr('own')).toEqual(['self'])
    expect(parseScopeExpr('parent')).toEqual(['up1'])
    expect(parseScopeExpr('ancestor')).toEqual(['up'])
  })

  it('parses canonical expressions', () => {
    expect(parseScopeExpr('self')).toEqual(['self'])
    expect(parseScopeExpr('self sib')).toEqual(['self', 'sib'])
    expect(parseScopeExpr('up1 down')).toEqual(['up1', 'down'])
    expect(parseScopeExpr('up2')).toEqual(['up2'])
  })

  it('rejects malformed expressions', () => {
    expect(parseScopeExpr('bogus')).toBeNull()
    expect(parseScopeExpr('sib1')).toBeNull()
    expect(parseScopeExpr('up0')).toBeNull()
    expect(parseScopeExpr('self sib x')).toBeNull()
  })

  it('treats all/none/empty as special values', () => {
    expect(isValidScopeExpr('')).toBe(true)
    expect(isValidScopeExpr('all')).toBe(true)
    expect(isValidScopeExpr('none')).toBe(true)
  })
})

describe('canonicalScope', () => {
  it('keeps all/none identity (never equal to each other)', () => {
    expect(canonicalScope('all')).toBe('all')
    expect(canonicalScope('none')).toBe('none')
    expect(canonicalScope('')).toBe('')
    expect(canonicalScope('all')).not.toBe(canonicalScope('none'))
  })

  it('normalizes legacy zones and whitespace', () => {
    expect(canonicalScope('own')).toBe('self')
    expect(canonicalScope('parent')).toBe('up1')
    expect(canonicalScope('ancestor')).toBe('up')
    expect(canonicalScope('  self   sib ')).toBe('self sib')
  })
})

describe('scopeMoves', () => {
  it('keeps special values with identity', () => {
    expect(scopeMoves('')).toEqual([])
    expect(scopeMoves('none')).toEqual([])
    expect(scopeMoves('all')).toEqual(['all'])
  })

  it('returns canonical sorted tokens without duplicates', () => {
    expect(scopeMoves('self sib')).toEqual(['self', 'sib'])
    expect(scopeMoves('sib up1 self')).toEqual(['self', 'up1', 'sib'])
    expect(scopeMoves('self self sib')).toEqual(['self', 'sib'])
    expect(scopeMoves('own sib')).toEqual(['self', 'sib'])
  })
})

describe('toggleScopeMove', () => {
  it('adds and removes ordinary moves', () => {
    expect(toggleScopeMove('', 'self')).toBe('self')
    expect(toggleScopeMove('self', 'sib')).toBe('self sib')
    expect(toggleScopeMove('self sib', 'sib')).toBe('self')
    expect(toggleScopeMove('self', 'self')).toBe('')
  })

  it('keeps canonical order', () => {
    expect(toggleScopeMove('sib', 'up1')).toBe('up1 sib')
    expect(toggleScopeMove('own', 'sib')).toBe('self sib')
  })

  it('all is exclusive: clears other moves and toggles off alone', () => {
    expect(toggleScopeMove('self sib', 'all')).toBe('all')
    expect(toggleScopeMove('all', 'all')).toBe('')
    expect(toggleScopeMove('all', 'self')).toBe('self')
  })

  it('none is exclusive: clears other moves and toggles off alone', () => {
    expect(toggleScopeMove('self up1 sib', 'none')).toBe('none')
    expect(toggleScopeMove('none', 'none')).toBe('')
    expect(toggleScopeMove('none', 'self')).toBe('self')
  })
})

describe('describeScopeExpr', () => {
  it('builds human-readable descriptions', () => {
    expect(describeScopeExpr('self')).toBe('свои')
    expect(describeScopeExpr('self sib')).toBe('свои + сиблинги')
    expect(describeScopeExpr('up1')).toBe('родители')
    expect(describeScopeExpr('down')).toBe('поддерево')
    expect(describeScopeExpr('none')).toBe('запрещено')
    expect(describeScopeExpr('all')).toBe('всё')
  })
})

describe('evalScope (chain moves)', () => {
  const owners = { owner: 5, processOwner: 3, projectOwner: 1 }

  it('all/none shortcuts', () => {
    expect(evalScope('all', 'task', owners, 99)).toBe(true)
    expect(evalScope('none', 'task', owners, 5)).toBe(false)
    expect(evalScope('', 'task', owners, 5)).toBe(false)
  })

  it('self — the row owner', () => {
    expect(evalScope('self', 'task', owners, 5)).toBe(true)
    expect(evalScope('self', 'task', owners, 6)).toBe(false)
    expect(evalScope('self', 'project', { projectOwner: 1 }, 1)).toBe(true)
    expect(evalScope('self', 'worker', { owner: 9 }, 9)).toBe(true)
  })

  it('up1 — the immediate parent owner', () => {
    expect(evalScope('up1', 'task', owners, 3)).toBe(true)
    expect(evalScope('up1', 'task', owners, 1)).toBe(false) // project owner ≠ parent
    expect(evalScope('up1', 'process', { processOwner: 3, projectOwner: 2 }, 2)).toBe(true)
  })

  it('up — any ancestor owner', () => {
    expect(evalScope('up', 'task', owners, 1)).toBe(true)
    expect(evalScope('up', 'task', owners, 3)).toBe(true)
    expect(evalScope('up', 'task', owners, 5)).toBe(true)
    expect(evalScope('up', 'task', owners, 9)).toBe(false)
  })

  it('milestone has no self owner', () => {
    expect(evalScope('self', 'milestone', { processOwner: 3 }, 3)).toBe(false)
    expect(evalScope('up1', 'milestone', { processOwner: 3 }, 3)).toBe(true)
  })

  it('disjunctions', () => {
    expect(evalScope('self up1', 'task', owners, 3)).toBe(true)
    expect(evalScope('self up1', 'task', owners, 9)).toBe(false)
  })
})

describe('evalScope (probe moves)', () => {
  it('sib/down need the probe', () => {
    expect(evalScope('sib', 'process', {}, 3, { sibling: true })).toBe(true)
    expect(evalScope('sib', 'process', {}, 3)).toBe(false)
    expect(evalScope('down', 'project', {}, 5, { descendant: true })).toBe(true)
    expect(evalScope('down', 'project', {}, 5, { descendant: false })).toBe(false)
    expect(evalScope('down', 'project', {}, 5)).toBe(false)
  })
})