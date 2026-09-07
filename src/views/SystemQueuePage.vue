<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { queueItems, refreshPendingCount, getFailedEntries } from '../offline/outbox'
import { retryFailed, discardFailed, syncNotice, dismissSyncNotice } from '../offline/sync'
import { isOffline } from '../offline/state'

const failedEntries = ref<Array<{ method: string; url: string; message: string }>>([])
const busy = ref(false)
const statusMsg = ref<string | null>(null)
const statusOk = ref(false)

let refreshTimer: number | null = null

const failedCount = computed(() => failedEntries.value.length)
const canRetry = computed(() => failedEntries.value.length > 0)

// === Change queue: selecting an entry and viewing technical details ===
const selectedId = ref<string | null>(null)

function toggleItem(id: string) {
  selectedId.value = selectedId.value === id ? null : id
}

/** Pretty JSON for displaying the request body. */
function jsonBody(body: unknown): string {
  if (body == null) return '—'
  try {
    return JSON.stringify(body, null, 2)
  } catch {
    return String(body)
  }
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin)
    return u.pathname + u.search
  } catch {
    return url
  }
}

function okMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = true
}

function failMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = false
}

async function refreshStatus() {
  await refreshPendingCount().catch(() => {})
  failedEntries.value = (await getFailedEntries().catch(() => [])).map((e) => ({
    method: e.method,
    url: e.url,
    message: e.message,
  }))
}

async function onRetry() {
  if (busy.value) return
  busy.value = true
  statusMsg.value = null
  try {
    await retryFailed()
    const n = syncNotice.value
    okMsg(n?.failed ? `Отправлено ${n.ok}, ошибок ${n.failed}` : 'Отправлено без ошибок')
    await refreshStatus()
  } finally {
    busy.value = false
  }
}

async function onDiscard() {
  if (busy.value) return
  busy.value = true
  statusMsg.value = null
  try {
    await discardFailed()
    dismissSyncNotice()
    okMsg('Отвергнутые записи удалены')
    await refreshStatus()
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void refreshStatus()
  refreshTimer = window.setInterval(refreshStatus, 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer != null) window.clearInterval(refreshTimer)
})
</script>

<template>
  <section class="sq">
    <h2 class="sq-title">Очередь изменений</h2>

    <div v-if="queueItems.length > 0" class="sq-card">
      <h3 class="sq-card-title">
        Отправка изменений
        <span class="sq-card-badge">{{ queueItems.length }}</span>
      </h3>
      <p v-if="isOffline" class="sq-hint queue-hint">
        Бэкенд недоступен: изменения копятся в очереди и отправятся при появлении сети.
      </p>
      <ul class="queue-list">
        <li
          v-for="it in queueItems"
          :key="it.id"
          class="queue-item"
          :class="{ open: selectedId === it.id }"
          @click="toggleItem(it.id)"
        >
          <div class="queue-item-head">
            <span class="queue-op" :class="`queue-op--${it.operation}`">{{ it.operationLabel }}</span>
            <span class="queue-entity">{{ it.entityLabel }}</span>
            <span v-if="it.error" class="queue-error-badge" :title="it.message">ошибка</span>
            <span class="queue-time">{{ formatTime(it.ts) }}</span>
          </div>
          <div class="queue-summary">
            <template v-if="it.summary">
              {{ it.summary }}<template v-if="it.targetId != null"> · id {{ it.targetId }}</template>
            </template>
            <template v-else-if="it.targetId != null">id {{ it.targetId }}</template>
            <span class="queue-toggle">{{ selectedId === it.id ? '—' : '↕ подробно' }}</span>
          </div>
          <div v-if="it.details.length && selectedId !== it.id" class="queue-details">
            <span v-for="(d, i) in it.details" :key="i" class="queue-detail">
              <span class="queue-detail-key">{{ d.key }}:</span>
              {{ d.value }}
            </span>
          </div>
          <div v-if="selectedId === it.id" class="queue-info">
            <div class="queue-info-list">
              <div class="queue-info-row">
                <span class="queue-info-label">Метод</span>
                <span class="queue-info-value">{{ it.method }}</span>
              </div>
              <div class="queue-info-row">
                <span class="queue-info-label">Entity</span>
                <span class="queue-info-value">{{ it.entityLabel }}</span>
              </div>
              <div v-if="it.tempId != null" class="queue-info-row">
                <span class="queue-info-label">Временный id</span>
                <span class="queue-info-value">{{ it.tempId }}</span>
              </div>
              <div v-if="it.error" class="queue-info-row">
                <span class="queue-info-label">Ошибка</span>
                <span class="queue-info-value queue-info-error">{{ it.message }}</span>
              </div>
              <div class="queue-info-row">
                <span class="queue-info-label">URL</span>
                <span class="queue-info-value queue-info-url">{{ it.url }}</span>
              </div>
            </div>
            <div class="queue-info-row queue-info-body-row">
              <span class="queue-info-label">Body</span>
              <pre class="queue-info-body">{{ jsonBody(it.body) }}</pre>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div v-else class="sq-card">
      <h3 class="sq-card-title">Очередь изменений</h3>
      <p class="sq-hint">Очередь пуста — все изменения синхронизированы.</p>
    </div>

    <div class="sq-card">
      <h3 class="sq-card-title">Ошибки синхронизации</h3>
      <div v-if="!canRetry" class="sq-hint no-errors">Ошибок нет.</div>
      <div v-else class="sp-errors">
        <div class="sp-errors-head">Ошибки синхронизации ({{ failedCount }})</div>
        <ul class="sp-errors-list">
          <li v-for="(it, i) in failedEntries.slice(0, 5)" :key="i" class="sp-errors-item">
            <span class="sp-errors-req">{{ it.method }} {{ shortUrl(it.url) }}</span>
            <span class="sp-errors-msg">{{ it.message }}</span>
          </li>
        </ul>
        <div class="sp-actions">
          <button type="button" class="sp-btn" :disabled="busy" @click="onRetry">Повторить ошибки</button>
          <button type="button" class="sp-btn ghost" :disabled="busy" @click="onDiscard">Пропустить ошибки</button>
        </div>
      </div>
      <p v-if="statusMsg" class="sp-msg" :class="{ ok: statusOk }">{{ statusMsg }}</p>
    </div>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.sq-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 20px;
}

.sq-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
  padding: 20px;
  margin-bottom: 24px;
}

.sq-card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sq-card-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--ui-milestone);
  color: #4a3d14;
  font-size: 12px;
  font-weight: 700;
}

.sq-hint {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-muted);
}

.queue-hint {
  color: var(--ui-warning);
  margin-bottom: 6px;
}

.no-errors {
  margin: 4px 0;
}

.queue-list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.queue-item {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 8px 10px;
  background: var(--ui-surface-2);
  cursor: pointer;
  transition: border-color var(--ui-duration), background var(--ui-duration);
}

.queue-item:hover {
  border-color: var(--ui-accent-soft);
}

.queue-item.open {
  border-color: var(--ui-accent);
  background: var(--ui-accent-soft);
}

.queue-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.queue-op {
  padding: 1px 8px;
  border-radius: 999px;
  color: var(--ui-accent-on);
  font-weight: 600;
}

.queue-op--create {
  background: var(--ui-success);
}

.queue-op--update {
  background: var(--ui-accent);
}

.queue-op--delete {
  background: var(--ui-danger);
}

.queue-entity {
  font-weight: 700;
  color: var(--ui-text);
}

.queue-error-badge {
  padding: 0 7px;
  border-radius: 999px;
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.queue-time {
  margin-left: auto;
  color: var(--ui-text-faint);
  white-space: nowrap;
}

.queue-summary {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}

.queue-details {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 12px;
  color: var(--ui-text-2);
}

.queue-detail-key {
  color: var(--ui-text-muted);
}

.queue-toggle {
  float: right;
  font-size: 11px;
  font-weight: 500;
  color: var(--ui-accent);
}

.queue-info {
  margin-top: 8px;
  border-top: 1px dashed var(--ui-border-strong);
  padding-top: 8px;
}

.queue-info-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.queue-info-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  align-items: baseline;
}

.queue-info-label {
  flex: 0 0 92px;
  color: var(--ui-text-muted);
  font-weight: 600;
}

.queue-info-value {
  color: var(--ui-text);
  word-break: break-all;
}

.queue-info-url {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ui-text-2);
}

.queue-info-error {
  color: var(--ui-danger);
}

.queue-info-body-row {
  margin-top: 6px;
  align-items: flex-start;
}

.queue-info-body {
  flex: 1;
  margin: 0;
  padding: 8px 10px;
  background: var(--ui-surface-3);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ui-text);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.sp-errors {
  margin-top: 4px;
  border: 1px solid var(--ui-danger-soft);
  background: var(--ui-danger-soft);
  border-radius: var(--ui-radius-sm);
  padding: 10px 12px;
}

.sp-errors-head {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-danger);
  margin-bottom: 6px;
}

.sp-errors-list {
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sp-errors-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.sp-errors-req {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ui-danger);
  word-break: break-all;
}

.sp-errors-msg {
  color: var(--ui-text-2);
}

.sp-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.sp-btn {
  margin-top: 14px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--ui-duration), opacity var(--ui-duration);
}

.sp-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}

.sp-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sp-btn.ghost {
  background: var(--ui-surface-3);
  color: var(--ui-text-2);
}

.sp-btn.ghost:hover:not(:disabled) {
  background: var(--ui-border);
}

.sp-actions .sp-btn {
  flex: 1;
  margin-top: 14px;
}

.sp-msg {
  font-size: 13px;
  color: var(--ui-danger);
  margin: 10px 0 0;
}

.sp-msg.ok {
  color: var(--ui-success);
}
</style>
