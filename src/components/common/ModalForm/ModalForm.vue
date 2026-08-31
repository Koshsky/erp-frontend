<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue'
import type { ModalFormProps, ModalField } from './types'

const props = withDefaults(defineProps<ModalFormProps>(), {
  submitLabel: 'Сохранить',
  busy: false,
  error: null,
  fields: () => [],
})

const emit = defineEmits<{
  save: [values: Record<string, string | number>]
  close: []
}>()

/** Local form state; initialized from fields on open */
const values = reactive<Record<string, any>>({})
const formEl = ref<HTMLElement | null>(null)

function resetValues() {
  for (const key of Object.keys(values)) delete values[key]
  for (const f of props.fields) {
    values[f.key] = f.value ?? ''
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) resetValues()
  },
)

const canSubmit = computed(() => {
  if (props.busy) return false
  return props.fields.every((f) => !f.required || String(values[f.key] ?? '').trim() !== '')
})

function onSubmit() {
  if (!canSubmit.value) return
  emit('save', { ...values })
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="mf-overlay"
      @mousedown.self="onOverlayClick"
      @keydown="onKeydown"
    >
      <div ref="formEl" class="mf" role="dialog" aria-modal="true" :aria-label="title">
        <div class="mf-head">
          <h3 class="mf-title">{{ title }}</h3>
          <button type="button" class="mf-close" aria-label="Закрыть" @click="emit('close')">×</button>
        </div>

        <slot v-if="$slots.default" />

        <form v-else class="mf-form" @submit.prevent="onSubmit">
          <label v-for="f in fields" :key="f.key" class="mf-field">
            <span class="mf-label">
              {{ f.label }}
              <span v-if="f.required" class="mf-req">*</span>
            </span>
            <textarea
              v-if="f.type === 'textarea'"
              v-model="values[f.key]"
              class="mf-input mf-textarea"
              rows="3"
              :placeholder="f.placeholder"
            />
            <select
              v-else-if="f.type === 'select'"
              v-model="values[f.key]"
              class="mf-input mf-select"
            >
              <option
                v-for="opt in f.options"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <input
              v-else-if="f.type === 'date'"
              v-model="values[f.key]"
              class="mf-input"
              type="date"
              :placeholder="f.placeholder"
            />
            <input
              v-else-if="f.type === 'number'"
              v-model.number="values[f.key]"
              class="mf-input"
              type="number"
              min="1"
              :placeholder="f.placeholder"
            />
            <input
              v-else
              v-model="values[f.key]"
              class="mf-input"
              type="text"
              :placeholder="f.placeholder"
            />
          </label>

          <p v-if="error" class="mf-error">{{ error }}</p>

          <div class="mf-actions">
            <button type="button" class="mf-btn mf-cancel" @click="emit('close')">Отмена</button>
            <button type="submit" class="mf-btn mf-save" :disabled="!canSubmit">
              <span v-if="busy" class="mf-spinner" />
              {{ submitLabel }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import "../../../styles/tokens.css";

.mf-overlay {
  position: fixed;
  inset: 0;
  z-index: 40000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
}
.mf {
  width: 100%;
  max-width: 420px;
  background: var(--ui-surface);
  border-radius: 10px;
  box-shadow: var(--ui-shadow-md);
  overflow: hidden;
}
.mf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-border);
}
.mf-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
}
.mf-close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.mf-close:hover {
  background: var(--ui-surface-2);
  color: var(--ui-text);
}
.mf-form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mf-label {
  font-size: 13px;
  color: var(--ui-text-2);
  font-weight: 500;
}
.mf-req {
  color: var(--ui-danger);
}
.mf-input {
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
.mf-input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.mf-textarea {
  resize: vertical;
  min-height: 70px;
}
.mf-error {
  margin: 0;
  font-size: 13px;
  color: var(--ui-danger);
}
.mf-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 2px;
}
.mf-btn {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--ui-duration), opacity var(--ui-duration);
}
.mf-cancel {
  background: var(--ui-surface-2);
  color: var(--ui-text-2);
}
.mf-cancel:hover {
  background: var(--ui-border);
}
.mf-save {
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.mf-save:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.mf-save:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.mf-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: var(--ui-accent-on);
  border-radius: 50%;
  animation: mf-spin 0.7s linear infinite;
}
@keyframes mf-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
