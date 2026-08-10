<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    placeholder?: string
    autocomplete?: string
    /** Скрывать кнопку переключения видимости */
    toggle?: boolean
    /** Общий атрибут id для label */
    id?: string
  }>(),
  {
    modelValue: '',
    label: '',
    placeholder: '••••••••',
    autocomplete: 'new-password',
    toggle: true,
    id: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const visible = ref(false)

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

function toggle() {
  visible.value = !visible.value
}
</script>

<template>
  <div class="pwf">
    <label v-if="label" class="pwf-label" :for="id">{{ label }}</label>
    <div class="pwf-input-wrap">
      <input
        :id="id"
        :value="modelValue"
        :type="visible ? 'text' : 'password'"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        class="pwf-input"
        @input="onInput"
      />
      <button v-if="toggle" type="button" class="pwf-eye" :aria-label="visible ? 'Скрыть пароль' : 'Показать пароль'" @click="toggle">
        <svg
          v-if="visible"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A8.8 8.8 0 0 1 12 5c5.5 0 9 6 9 6a15.4 15.4 0 0 1-3 3.6M6.6 6.6A15 15 0 0 0 3 11s3.5 6 9 6a8.9 8.9 0 0 0 2.6-.4" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pwf {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #444;
}

.pwf-label {
  color: #444;
}

.pwf-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.pwf-input {
  width: 100%;
  padding: 12px 14px;
  padding-right: 46px;
  border: 1px solid #d0d4da;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 400;
  color: #2c3e50;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.pwf-input::placeholder {
  color: #bbb;
}

.pwf-input:focus {
  outline: none;
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.pwf-eye {
  position: absolute;
  right: 6px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #7a8699;
  cursor: pointer;
  border-radius: 8px;
  transition: color 0.15s, background 0.15s;
}

.pwf-eye:hover {
  color: #1a73e8;
  background: #f1f4f9;
}
</style>
