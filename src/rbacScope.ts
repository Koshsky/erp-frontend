/**
 * Client-side evaluator of the RBAC scope EXPRESSIONS — the mirror of the
 * backend engine (internal/authz/engine: scopeexpr.go + eval.go + tree.go).
 *
 * A scope is "who may access the entity": the caller owns at least one node
 * reachable from the entity by the expression's TREE MOVES:
 *   self      — the entity itself (legacy "own"),
 *   up1       — the parent node (legacy "parent"),
 *   up        — any ancestor node (legacy "ancestor"),
 *   sib       — a sibling node (same parent),
 *   down      — a descendant node,
 *   all/none  — unconditional / denied.
 * The sib/down moves need data the card does not carry — the caller supplies
 * the result via the optional probe ({ descendant?, sibling? }).
 */

export type ScopeMove = 'self' | 'up' | 'up1' | 'up2' | 'down' | 'down2' | 'sib'

/** All move codes accepted by the parser (canonical + legacy aliases). */
export const SCOPE_TOKENS = ['self', 'up', 'up1', 'up2', 'down', 'down2', 'sib', 'all', 'none'] as const

/** Owners of an entity — the chain positions used by the evaluator. */
export interface ScopeOwners {
  owner?: number | null
  processOwner?: number | null
  projectOwner?: number | null
}

/** Data-dependent probe results (sib/down) supplied by the caller. */
export interface ScopeProbe {
  descendant?: boolean
  sibling?: boolean
}

const MOVE_RE = /^(self|up\d*|down\d*|sib)$/
const DEPTH_RE = /^(up|down)(\d*)$/

/**
 * Parses a scope expression into canonical move tokens, or null when invalid.
 * Legacy codes are canonicalized (own→self, parent→up1, ancestor→up).
 */
export function parseScopeExpr(expr: string): ScopeMove[] | null {
  const raw = (expr ?? '').trim()
  if (raw === '' || raw === 'all' || raw === 'none') return raw === 'all' || raw === 'none' ? [] : null
  const legacy: Record<string, string> = { own: 'self', parent: 'up1', ancestor: 'up' }
  const tokens = raw.split(/\s+/)
  const out: ScopeMove[] = []
  for (const t of tokens) {
    const canon = legacy[t] ?? t
    if (!MOVE_RE.test(canon)) return null
    const depth = DEPTH_RE.exec(canon)
    if (depth && depth[2] !== '' && Number(depth[2]) < 1) return null // up0/down0
    out.push(canon as ScopeMove)
  }
  return out.length ? out : null
}

/** Whether the string is a valid scope expression. */
export function isValidScopeExpr(expr: string): boolean {
  const raw = (expr ?? '').trim()
  if (raw === '' || raw === 'all' || raw === 'none') return true
  return parseScopeExpr(raw) != null
}

/**
 * Canonical comparison form of a scope: legacy codes normalize (own→self,
 * parent→up1, ancestor→up) and the special values keep their identity
 * ("all" and "none" must never collapse onto each other).
 */
export function canonicalScope(scope: string): string {
  const t = (scope ?? '').trim()
  if (t === '' || t === 'all' || t === 'none') return t
  return parseScopeExpr(t)?.join(' ') ?? t
}

/** Display order of the move chips (canonical sequence of the tree). */
const MOVE_RANK: Record<string, number> = { self: 0, up1: 1, up: 2, sib: 3, down: 4 }

function moveRank(move: string): number {
  return MOVE_RANK[move] ?? 10
}

/**
 * The moves of an expression as a sorted, de-duplicated list; the special
 * values keep their identity: ''/'none' → [], 'all' → ['all'], otherwise
 * the canonical tokens (legacy zones normalize).
 */
export function scopeMoves(expr: string): string[] {
  const raw = (expr ?? '').trim()
  if (raw === '' || raw === 'none') return []
  if (raw === 'all') return ['all']
  const moves = parseScopeExpr(raw)
  if (!moves) return []
  return [...new Set(moves)].sort((a, b) => moveRank(a) - moveRank(b))
}

/**
 * Toggles one move of an expression (multi-select chips):
 *   - 'all' / 'none' are EXCLUSIVE: selecting one clears every other move
 *     (and toggling the active one off yields '');
 *   - selecting an ordinary move while 'all'/'none' is active replaces it;
 *   - otherwise the move is added/removed, canonical order, no duplicates.
 */
export function toggleScopeMove(expr: string, move: string): string {
  const m = move.trim()
  const raw = (expr ?? '').trim()
  const cur = scopeMoves(expr)
  if (m === 'all' || m === 'none') {
    return raw === m ? '' : m
  }
  if (cur.length === 1 && (cur[0] === 'all' || cur[0] === 'none')) return m
  if (cur.includes(m)) {
    return cur.filter((x) => x !== m).join(' ')
  }
  return [...cur, m].sort((a, b) => moveRank(a) - moveRank(b)).join(' ')
}

/** Human-readable description of an expression (Russian — product language). */
export function describeScopeExpr(expr: string): string {
  const raw = (expr ?? '').trim()
  if (!raw) return 'не задано'
  if (raw === 'all') return 'всё'
  if (raw === 'none') return 'запрещено'
  const tokens = raw.split(/\s+/)
  const words: Record<string, string> = {
    self: 'свои',
    up1: 'родители',
    up: 'предки',
    up2: 'предки до 2 ур.',
    down: 'поддерево',
    down2: 'поддерево 2 ур.',
    sib: 'сиблинги',
    own: 'свои',
    parent: 'родители',
    ancestor: 'предки',
  }
  const parts = tokens.map((t) => words[t] ?? `«${t}»`)
  return parts.join(' + ')
}

/**
 * Evaluates a scope expression for an entity: true when the caller owns at
 * least one node reachable by the moves (or the expression is "all").
 */
export function evalScope(
  expr: string,
  resource: string,
  o: ScopeOwners,
  uid: number,
  probe?: ScopeProbe,
): boolean {
  const raw = (expr ?? '').trim()
  if (raw === '' || raw === 'none') return false
  if (raw === 'all') return true
  const moves = parseScopeExpr(raw)
  if (!moves) return false
  if (uid <= 0) return false
  for (const m of moves) {
    switch (m) {
      case 'self':
        if (ownOf(resource, o) === uid) return true
        break
      case 'up1':
        if (parentOf(resource, o) === uid) return true
        break
      case 'up':
      case 'up2':
        if (ownOf(resource, o) === uid || parentOf(resource, o) === uid || ancestorOf(resource, o) === uid) {
          return true
        }
        break
      case 'sib':
        if (probe?.sibling) return true
        break
      case 'down':
      case 'down2':
        if (probe?.descendant) return true
        break
    }
  }
  return false
}

/** The row owner (L0) of a resource (mirror of the backend ownField). */
function ownOf(resource: string, o: ScopeOwners): number | null | undefined {
  switch (resource) {
    case 'project':
      return o.projectOwner
    case 'process':
      return o.processOwner
    case 'task':
    case 'resource':
    case 'worker':
      return o.owner
    default:
      return undefined
  }
}

/** The immediate parent owner (mirror of the backend parentField). */
function parentOf(resource: string, o: ScopeOwners): number | null | undefined {
  switch (resource) {
    case 'process':
      return o.projectOwner
    case 'task':
    case 'milestone':
    case 'assignment':
      return o.processOwner
    default:
      return undefined
  }
}

/** Any higher chain owner beyond the immediate parent (project owner). */
function ancestorOf(resource: string, o: ScopeOwners): number | null | undefined {
  switch (resource) {
    case 'process':
    case 'task':
    case 'milestone':
    case 'assignment':
      return o.projectOwner
    default:
      return undefined
  }
}