<script setup lang="ts">
import { computed, ref } from 'vue'
import { ModalForm } from '../../common'
import type { DtoCommentResponse } from '@/api'
import {
  flattenComments,
  type TaskCommentsProps,
  type SendCommentPayload,
  type DeleteCommentPayload,
} from './types'

const props = withDefaults(defineProps<TaskCommentsProps>(), {
  taskTitle: '',
  comments: () => [],
  users: () => [],
  busy: false,
  error: null,
  disabledReason: null,
  canManage: false,
  userId: null,
})

const emit = defineEmits<{
  close: []
  send: [payload: SendCommentPayload]
  delete: [payload: DeleteCommentPayload]
}>()

/** Черновик корневого комментария и ответа (один активный ответ одновременно) */
const rootDraft = ref('')
const replyTo = ref<number | null>(null)
const replyDraft = ref('')

const composerDisabled = computed(() => props.busy || props.disabledReason != null)

/** Плоский пре-ордер список для рендера с отступами */
const flat = computed(() => flattenComments(props.comments))

const userById = computed(() => new Map((props.users || []).map((u) => [u.id ?? 0, u])))

const fmtDT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const fmtDTFull = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : fmtDT.format(d)
}

function fmtDateFull(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : fmtDTFull.format(d)
}

function authorName(c: DtoCommentResponse): string {
  if (c.author_id == null) return '—'
  return userById.value.get(c.author_id)?.name ?? `Пользователь #${c.author_id}`
}

/** Удаление: автор — всегда, чужие — только при canManage (admin/vp) */
function canDelete(c: DtoCommentResponse): boolean {
  return c.author_id != null && (c.author_id === props.userId || props.canManage)
}

function openReply(commentId: number) {
  if (composerDisabled.value) return
  if (replyTo.value === commentId) {
    replyTo.value = null
    replyDraft.value = ''
    return
  }
  replyTo.value = commentId
  replyDraft.value = ''
}

function sendRoot() {
  const content = rootDraft.value.trim()
  if (!content || composerDisabled.value) return
  emit('send', { content })
  rootDraft.value = ''
}

function sendReply(commentId: number) {
  const content = replyDraft.value.trim()
  if (!content || composerDisabled.value) return
  emit('send', { content, parent_id: commentId })
  replyTo.value = null
  replyDraft.value = ''
}
</script>

<template>
  <ModalForm :open="open" :title="`Комментарии: ${taskTitle || `Задача #${taskId}`}`" @close="emit('close')">
    <div class="tc">
      <p v-if="error" class="tc-error">{{ error }}</p>
      <p v-if="disabledReason" class="tc-offline">{{ disabledReason }}</p>

      <div class="tc-list">
        <div v-if="busy && flat.length === 0" class="tc-state">Загрузка комментариев…</div>
        <div v-else-if="flat.length === 0" class="tc-state">Комментариев пока нет</div>

        <div
          v-for="(n, i) in flat"
          :key="n.comment.id ?? i"
          class="tc-item"
          :style="{ marginLeft: `${Math.min(n.depth, 8) * 14}px` }"
        >
          <div class="tc-head">
            <span class="tc-author">{{ authorName(n.comment) }}</span>
            <span v-if="n.orphan" class="tc-orphan" title="Родительский комментарий удалён">в ответ на удалённый комментарий</span>
            <span class="tc-date" :title="fmtDateFull(n.comment.created_at)">{{ fmtDate(n.comment.created_at) }}</span>
          </div>
          <div class="tc-text">{{ n.comment.content }}</div>
          <div class="tc-actions">
            <button
              type="button"
              class="tc-btn"
              :disabled="composerDisabled"
              @click="openReply(n.comment.id ?? 0)"
            >Ответить</button>
            <button
              v-if="canDelete(n.comment)"
              type="button"
              class="tc-icon tc-del"
              :disabled="busy"
              title="Удалить комментарий"
              aria-label="Удалить комментарий"
              @click="emit('delete', { comment_id: n.comment.id ?? 0 })"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          </div>
          <div v-if="replyTo === (n.comment.id ?? 0)" class="tc-reply">
            <textarea
              v-model="replyDraft"
              class="tc-input"
              rows="2"
              :disabled="composerDisabled"
              placeholder="Ответ…"
              @keydown.enter.exact.prevent="sendReply(n.comment.id ?? 0)"
            />
            <div class="tc-reply-row">
              <button
                type="button"
                class="tc-btn tc-send"
                :disabled="composerDisabled || !replyDraft.trim()"
                @click="sendReply(n.comment.id ?? 0)"
              >Отправить</button>
            </div>
          </div>
        </div>
      </div>

      <div class="tc-composer">
        <textarea
          v-model="rootDraft"
          class="tc-input"
          rows="3"
          :disabled="composerDisabled"
          placeholder="Написать комментарий…"
          @keydown.enter.exact.prevent="sendRoot"
        />
        <div class="tc-composer-row">
          <span v-if="disabledReason" class="tc-hint">{{ disabledReason }}</span>
          <button
            type="button"
            class="tc-btn tc-send"
            :disabled="composerDisabled || !rootDraft.trim()"
            @click="sendRoot"
          >Отправить</button>
        </div>
      </div>
    </div>
  </ModalForm>
</template>

<style scoped>
.tc {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px;
}
.tc-error {
  margin: 0;
  font-size: 13px;
  color: #d93025;
}
.tc-offline {
  margin: 0;
  font-size: 13px;
  color: #b06000;
}
.tc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 46vh;
  overflow-y: auto;
  padding: 2px;
}
.tc-state {
  padding: 18px 0;
  text-align: center;
  font-size: 14px;
  color: #999;
  border: 1px dashed #ddd;
  border-radius: 8px;
}
.tc-item {
  padding: 8px 10px;
  background: #f6f6f6;
  border: 1px solid #ececec;
  border-radius: 8px;
}
.tc-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.tc-author {
  font-size: 13px;
  font-weight: 700;
  color: #174ea6;
}
.tc-orphan {
  font-size: 11px;
  color: #999;
  font-style: italic;
}
.tc-date {
  margin-left: auto;
  font-size: 11px;
  color: #777;
  white-space: nowrap;
}
.tc-text {
  margin-top: 4px;
  font-size: 14px;
  line-height: 1.45;
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
}
.tc-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.tc-reply {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tc-reply-row {
  display: flex;
  justify-content: flex-end;
}
.tc-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid #eee;
  padding-top: 12px;
}
.tc-composer-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.tc-hint {
  font-size: 12px;
  color: #b06000;
}
.tc-input {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.tc-input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.tc-input:disabled {
  background: #f3f3f3;
  color: #888;
  cursor: not-allowed;
}
.tc-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: transparent;
  color: #1a73e8;
}
.tc-btn:hover:not(:disabled) {
  background: rgba(26, 115, 232, 0.08);
}
.tc-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
/* Квадратная кнопка-иконка (удаление комментария) */
.tc-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: transparent;
}
.tc-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.tc-del {
  color: #d93025;
}
.tc-del:hover:not(:disabled) {
  background: #ffe5e5;
}
.tc-send {
  background: #1a73e8;
  color: #fff;
}
.tc-send:hover:not(:disabled) {
  background: #1765cc;
}
</style>