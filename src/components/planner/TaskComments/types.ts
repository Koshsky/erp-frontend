import type { DtoCommentResponse, DtoUserInfo } from '@/api'

/** Плоский элемент дерева обсуждения (pre-order) для рендера с отступами */
export interface CommentFlatNode {
  comment: DtoCommentResponse
  /** Глубина вложенности (0 — корневой/осиротевший) */
  depth: number
  /** Родитель удалён — ответ отображается на верхнем уровне с пометкой */
  orphan: boolean
}

export interface TaskCommentsProps {
  open: boolean
  taskId: number
  taskTitle?: string
  /** Плоский список комментариев задачи (GET /task/{id}/comments) */
  comments?: DtoCommentResponse[]
  /** Справочник пользователей для имён авторов (author_id → name) */
  users?: DtoUserInfo[]
  busy?: boolean
  error?: string | null
  /** Причина блокировки отправки (например, офлайн); null — отправка доступна */
  disabledReason?: string | null
  /** Право удалять чужие комментарии (admin/vp); автор удаляет своё всегда */
  canManage?: boolean
  /** Текущий пользователь — для кнопки «Удалить» у своих комментариев */
  userId?: number | null
}

export interface SendCommentPayload {
  content: string
  parent_id?: number
}

export interface DeleteCommentPayload {
  comment_id: number
}

/** Строит пре-ордер плоский список: ответы идут сразу после родителя с отступом.
 *  Если parent_id ссылается на отсутствующий комментарий (удалён) — узел
 *  поднимается на верхний уровень с пометкой orphan. */
export function flattenComments(list: DtoCommentResponse[]): CommentFlatNode[] {
  const byId = new Map<number, DtoCommentResponse>()
  for (const c of list) if (c.id != null) byId.set(c.id, c)

  const childrenOf = new Map<number, DtoCommentResponse[]>()
  for (const c of list) {
    const pid = c.parent_id
    if (pid != null && byId.has(pid)) {
      const arr = childrenOf.get(pid) ?? []
      arr.push(c)
      childrenOf.set(pid, arr)
    }
  }

  const out: CommentFlatNode[] = []
  const walk = (c: DtoCommentResponse, depth: number, orphan: boolean) => {
    out.push({ comment: c, depth, orphan })
    const kids = childrenOf.get(c.id ?? -1) ?? []
    for (const child of kids) walk(child, depth + 1, false)
  }

  for (const c of list) {
    // Корни: без parent_id или с parent_id, которого нет в списке (удалён).
    if (c.parent_id != null && byId.has(c.parent_id)) continue
    walk(c, 0, c.parent_id != null && !byId.has(c.parent_id))
  }
  return out
}