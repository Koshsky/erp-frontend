<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import type { CopyFieldProps } from './types'

const props = withDefaults(defineProps<CopyFieldProps>(), {
  label: '',
  monospace: true,
  copyLabel: 'Скопировать',
})

const copied = ref(false)
const fieldRef = ref<HTMLElement | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | null = null

function flashCopied() {
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copied.value = false
  }, 1500)
}

function selectText() {
  const el = fieldRef.value
  if (!el) return
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

async function onCopy() {
  if (!props.value) return
  try {
    await navigator.clipboard.writeText(props.value)
    flashCopied()
  } catch {
    // Буфер обмена недоступен — выделяем текст для ручного копирования.
    selectText()
  }
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <div class="cf">
    <label v-if="label" class="cf-label">{{ label }}</label>
    <div ref="fieldRef" class="cf-field" :class="{ 'cf-field--mono': monospace }" @click="selectText">
      <span class="cf-value">{{ value || '—' }}</span>
      <button
        type="button"
        class="cf-copy"
        :class="{ 'cf-copy--done': copied }"
        :disabled="!value"
        :aria-label="copied ? 'Скопировано' : copyLabel"
        :title="copied ? 'Скопировано' : copyLabel"
        @click.stop="onCopy"
      >
        <svg
          v-if="!copied"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.cf {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cf-label {
  font-size: 13px;
  font-weight: 600;
  color: #444;
}
.cf-field {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f6f8fa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 9px 8px 9px 12px;
  cursor: text;
  user-select: all;
  min-width: 0;
}
.cf-value {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  color: #1a3a6b;
  font-size: 14px;
}
.cf-field--mono .cf-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
.cf-copy {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d0d4da;
  background: #fff;
  border-radius: 7px;
  color: #5f6b7a;
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.cf-copy:hover:not(:disabled) {
  color: #1a73e8;
  background: #f1f4f9;
}
.cf-copy:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.cf-copy--done {
  color: #1e8e3e;
  border-color: #b7e3c2;
  background: #eef9f1;
}
</style>
