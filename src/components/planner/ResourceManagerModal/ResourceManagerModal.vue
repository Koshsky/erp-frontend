<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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

/** Ресурсы, ещё не назначенные задаче — доступны для добавления */
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

/** Сброс формы при открытии и после изменения набора назначенных (успешный add/remove) */
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

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function resourceTitle(r: AssignedResource): string {
  return r.title || r.code || `Ресурс #${r.resource_id}`
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="rm-overlay"
      @mousedown.self="onOverlayClick"
      @keydown="onKeydown"
    >
      <div class="rm" role="dialog" aria-modal="true" :aria-label="`Ресурсы задачи: ${taskTitle}`">
        <div class="rm-head">
          <h3 class="rm-title">Ресурсы задачи: {{ taskTitle }}</h3>
          <button type="button" class="rm-close" aria-label="Закрыть" @click="emit('close')">×</button>
        </div>

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
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rm-overlay {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
}
.rm {
  width: 100%;
  max-width: 440px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.rm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e8e8e8;
}
.rm-title {
  font-size: 16px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0;
}
.rm-close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.rm-close:hover {
  background: #f2f2f2;
  color: #333;
}
.rm-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rm-error {
  margin: 0;
  font-size: 13px;
  color: #d93025;
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
  background: #f6f6f6;
  border: 1px solid #ececec;
  border-radius: 8px;
  font-size: 14px;
  color: #333;
}
.rm-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rm-item-qty {
  color: #666;
  white-space: nowrap;
}
.rm-remove {
  border: none;
  background: transparent;
  font-size: 14px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.rm-remove:hover:not(:disabled) {
  background: #ffe5e5;
  color: #d93025;
}
.rm-remove:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.rm-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 14px;
  color: #999;
  border: 1px dashed #ddd;
  border-radius: 8px;
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
.rm-input:focus {
  border-color: #1a73e8;
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
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #1a73e8;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.rm-btn:hover:not(:disabled) {
  background: #1765cc;
}
.rm-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.rm-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: rm-spin 0.7s linear infinite;
}
@keyframes rm-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
