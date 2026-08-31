<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ModalForm } from '../../common'
import type {
  ResourceManagerModalProps,
  AssignedResource,
  AddResourcePayload,
  ResourceOption,
} from './types'

const props = withDefaults(defineProps<ResourceManagerModalProps>(), {
  taskTitle: '',
  busy: false,
  error: null,
})

const emit = defineEmits<{
  add: [payload: AddResourcePayload]
  remove: [payload: { resource_id: number }]
  close: []
}>()

const selectedResourceId = ref<number | ''>('')
const quantity = ref(1)

/** Resources not yet assigned to the task — available for adding */
const available = computed<ResourceOption[]>(() =>
  props.resources.filter(
    (r) => !props.assigned.some((a) => a.resource_id === r.id),
  ),
)

const canAdd = computed(
  () => !props.busy && selectedResourceId.value !== '' && quantity.value >= 1,
)

function resetForm() {
  selectedResourceId.value = ''
  quantity.value = 1
}

/** Form reset on open and after the assigned set changes (successful add/remove) */
watch(
  () => props.open,
  (open) => {
    if (open) resetForm()
  },
)

watch(
  () => props.assigned.map((a) => a.resource_id).sort((a, b) => a - b).join(','),
  () => {
    if (props.open) resetForm()
  },
)

function onSubmit() {
  if (!canAdd.value) return
  emit('add', { resource_id: selectedResourceId.value as number, quantity: quantity.value })
}

function resourceTitle(r: AssignedResource): string {
  return r.title || r.code || `Ресурс #${r.resource_id}`
}
</script>

<template>
  <ModalForm :open="open" :title="`Ресурсы задачи: ${taskTitle}`" @close="emit('close')">
    <div class="rm-body">
      <p v-if="error" class="rm-error">{{ error }}</p>

      <div v-if="assigned.length" class="rm-list">
        <div v-for="a in assigned" :key="a.resource_id" class="rm-item">
          <span class="rm-item-name">{{ resourceTitle(a) }}</span>
          <span class="rm-item-qty">× {{ a.quantity }}</span>
          <button
            type="button"
            class="rm-remove"
            :disabled="busy"
            aria-label="Убрать ресурс"
            @click="emit('remove', { resource_id: a.resource_id })"
          >✕</button>
        </div>
      </div>
      <div v-else class="rm-empty">Ресурсы не назначены</div>

      <div class="rm-add">
        <div class="rm-fields">
          <select
            v-model="selectedResourceId"
            class="rm-input rm-select"
            :disabled="busy"
          >
            <option value="">— выберите ресурс —</option>
            <option
              v-for="r in available"
              :key="r.id"
              :value="r.id"
            >
              {{ r.title || r.code || `Ресурс #${r.id}` }}
            </option>
          </select>
          <input
            v-model.number="quantity"
            class="rm-input rm-qty"
            type="number"
            min="1"
            :disabled="busy"
          />
        </div>
        <button
          type="button"
          class="rm-btn"
          :disabled="!canAdd"
          @click="onSubmit"
        >
          <span v-if="busy" class="rm-spinner" />
          Добавить
        </button>
      </div>
    </div>
  </ModalForm>
</template>

<style scoped>
@import '../../../styles/tokens.css';
.rm-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rm-error {
  margin: 0;
  font-size: 13px;
  color: var(--ui-danger);
}
.rm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rm-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--ui-surface-2);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  font-size: 14px;
  color: var(--ui-text);
}
.rm-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rm-item-qty {
  color: var(--ui-text-2);
  white-space: nowrap;
}
.rm-remove {
  border: none;
  background: transparent;
  font-size: 14px;
  line-height: 1;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.rm-remove:hover:not(:disabled) {
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
}
.rm-remove:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.rm-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 14px;
  color: var(--ui-text-muted);
  border: 1px dashed var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
}
.rm-add {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rm-fields {
  display: flex;
  gap: 8px;
}
.rm-input {
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
.rm-input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.rm-select {
  flex: 1;
  min-width: 0;
}
.rm-qty {
  width: 72px;
}
.rm-btn {
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
}
.rm-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.rm-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.rm-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: var(--ui-accent-on);
  border-radius: 50%;
  animation: rm-spin 0.7s linear infinite;
}
@keyframes rm-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
