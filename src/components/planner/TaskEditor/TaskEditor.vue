<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ModalForm } from '../../common'
import { ColorField } from '../../common'
import type {
  TaskEditorProps,
  NewSubtaskPayload,
  UpdateSubtaskPayload,
  TaskEditorPatch,
} from './types'

const props = withDefaults(defineProps<TaskEditorProps>(), {
  task: null,
  canManage: false,
  canCreateSubtask: false,
  busy: false,
  error: null,
  disabledReason: null,
})

const emit = defineEmits<{
  save: [patch: TaskEditorPatch]
  addSubtask: [payload: NewSubtaskPayload]
  updateSubtask: [payload: UpdateSubtaskPayload]
  deleteSubtask: [id: number]
  close: []
}>()

// === Left panel: task fields ===
const title = ref('')
const color = ref('')
const status = ref('')
const ownerId = ref<number | ''>('')

// Status catalog (fixed 3-set, mirrors the backend CHECK).
const statusOptions = [
  { value: 'not_started', label: 'Не начата' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Завершена' },
]

watch(
  () => props.open,
  (open) => {
    if (!open || !props.task) return
    title.value = props.task.title ?? ''
    color.value = props.task.color ?? ''
    status.value = props.task.status ?? 'not_started'
    ownerId.value = props.task.owner_id ?? ''
  },
)

const canSave = computed(() => props.canManage && !props.busy && title.value.trim() !== '')

function onSave() {
  if (!canSave.value) return
  const owner =
    ownerId.value === '' ? null : Number(ownerId.value)
  // Owner cannot be removed: null means "not sent" (the backend keeps the old).
  const patch: { title?: string; color?: string; status?: string; owner_id?: number } = {
    title: title.value.trim(),
    color: color.value || undefined,
    status: status.value,
  }
  if (owner != null) patch.owner_id = owner
  emit('save', patch)
}

// === Right panel: subtasks (todo list) ===
const newTitle = ref('')

const canAdd = computed(
  () => props.canCreateSubtask && !props.busy && newTitle.value.trim() !== '',
)

function onAddSubtask() {
  if (!canAdd.value) return
  emit('addSubtask', { title: newTitle.value.trim() })
  newTitle.value = ''
}

/** Status label for a subtask row (short) */
function subtaskStatusLabel(s: { status?: string }): string {
  switch (s.status) {
    case 'done':
      return 'Завершена'
    case 'in_progress':
      return 'В работе'
    default:
      return 'Не начата'
  }
}

/** Cycle a subtask status: not_started → in_progress → done → not_started */
function cycleStatus(s: { id: number; status?: string }) {
  const next =
    s.status === 'not_started'
      ? 'in_progress'
      : s.status === 'in_progress'
        ? 'done'
        : 'not_started'
  emit('updateSubtask', { id: s.id, patch: { status: next } })
}

function onDeleteSubtask(id: number) {
  emit('deleteSubtask', id)
}
</script>

<template>
  <ModalForm
    :open="open"
    :title="task ? `Задача: ${task.title}` : 'Задача'"
    @close="emit('close')"
  >
    <div class="te-body">
      <div class="te-left">
        <label class="te-field">
          <span class="te-label">Название</span>
          <input
            v-model="title"
            class="te-input"
            type="text"
            :disabled="!canManage || busy"
            :placeholder="task?.title || 'Название задачи'"
          />
        </label>

        <div class="te-field">
          <span class="te-label">Статус</span>
          <select
            v-model="status"
            class="te-input te-select"
            :disabled="!canManage || busy"
          >
            <option v-for="o in statusOptions" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </div>

        <div class="te-field">
          <span class="te-label">Ответственный</span>
          <select
            v-model="ownerId"
            class="te-input te-select"
            :disabled="!canManage || busy"
          >
            <option value="">— не выбран —</option>
            <option v-for="o in ownerOptions" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </div>

        <div class="te-field">
          <span class="te-label">Цвет</span>
          <ColorField v-model="color" label="Цвет задачи" />
        </div>

        <button
          type="button"
          class="te-save"
          :disabled="!canSave"
          @click="onSave"
        >
          <span v-if="busy" class="te-spinner" />
          Сохранить
        </button>
      </div>

      <div class="te-right">
        <h4 class="te-subtitle">Подзадачи (операции)</h4>
        <p v-if="error" class="te-error">{{ error }}</p>

        <div v-if="subtasks.length" class="te-list">
          <div v-for="s in subtasks" :key="s.id" class="te-item">
            <button
              type="button"
              class="te-status"
              :class="`is-${s.status || 'not_started'}`"
              :title="`Статус: ${subtaskStatusLabel(s)} (нажмите, чтобы изменить)`"
              :disabled="!canManage || busy"
              @click="cycleStatus(s)"
            />
            <span class="te-item-title" :title="s.title">{{ s.title }}</span>
            <button
              type="button"
              class="te-remove"
              :disabled="!canManage || busy"
              :aria-label="`Удалить подзадачу ${s.title}`"
              @click="onDeleteSubtask(s.id)"
            >✕</button>
          </div>
        </div>
        <div v-else class="te-empty">Подзадач нет</div>

        <div class="te-add">
          <input
            v-model="newTitle"
            class="te-input"
            type="text"
            placeholder="Новая подзадача…"
            :disabled="!canCreateSubtask || busy"
            @keyup.enter="onAddSubtask"
          />
          <button
            type="button"
            class="te-add-btn"
            :disabled="!canAdd"
            @click="onAddSubtask"
          >
            Добавить
          </button>
        </div>
        <p v-if="disabledReason" class="te-note">{{ disabledReason }}</p>
      </div>
    </div>
  </ModalForm>
</template>

<style scoped>
@import '../../../styles/tokens.css';
.te-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 16px;
  padding: 16px;
}
.te-left,
.te-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.te-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.te-label {
  font-size: 13px;
  color: var(--ui-text-2);
  font-weight: 500;
}
.te-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}
.te-input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.te-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.te-select {
  height: 40px;
}
.te-save {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  align-self: flex-start;
}
.te-save:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.te-save:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.te-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: var(--ui-accent-on);
  border-radius: 50%;
  animation: te-spin 0.7s linear infinite;
}
@keyframes te-spin {
  to {
    transform: rotate(360deg);
  }
}
.te-subtitle {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--ui-text);
}
.te-error {
  margin: 0;
  font-size: 13px;
  color: var(--ui-danger);
}
.te-note {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.te-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.te-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  background: var(--ui-surface-2);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  font-size: 14px;
  color: var(--ui-text);
}
.te-status {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border: none;
  border-radius: 50%;
  padding: 0;
  cursor: pointer;
  transition: transform var(--ui-duration);
}
.te-status:hover:not(:disabled) {
  transform: scale(1.2);
}
.te-status:disabled {
  cursor: not-allowed;
}
.te-status.is-not_started {
  background: #94a3b8;
}
.te-status.is-in_progress {
  background: #0f83c4;
}
.te-status.is-done {
  background: #22c55e;
}
.te-item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.te-remove {
  border: none;
  background: transparent;
  font-size: 14px;
  line-height: 1;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.te-remove:hover:not(:disabled) {
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
}
.te-remove:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.te-empty {
  padding: 14px 0;
  text-align: center;
  font-size: 13px;
  color: var(--ui-text-muted);
  border: 1px dashed var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
}
.te-add {
  display: flex;
  gap: 8px;
}
.te-add .te-input {
  flex: 1;
}
.te-add-btn {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  white-space: nowrap;
}
.te-add-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.te-add-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .te-body {
    grid-template-columns: 1fr;
  }
}
</style>