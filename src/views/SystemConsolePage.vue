<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../store'
import { getApiUrl, setApiUrl, hasApiUrlOverride, httpSchemeWarning } from '../config'
import { warmNow, warmupProgress } from '../offline/warmup'
import { syncNow, syncAll, syncNotice } from '../offline/sync'
import { pendingCount, pushProgress, refreshPendingCount } from '../offline/outbox'
import { isOffline } from '../offline/state'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const busy = ref(false)
const statusMsg = ref<string | null>(null)
const statusOk = ref(false)
const apiUrlWarn = ref<string | null>(null)
const apiUrl = ref('')

let refreshTimer: number | null = null

const pendingLabel = computed(() => (pendingCount.value > 0 ? `PUSH (${pendingCount.value})` : 'PUSH'))

/** Percentage of the sent queue (for the PUSH progress bar) */
const pushPercent = computed(() => {
  const p = pushProgress.value
  if (!p || p.total === 0) return 0
  return Math.round((p.done / p.total) * 100)
})

const connectionLabel = computed(() => (isOffline.value ? 'офлайн' : 'онлайн'))

function okMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = true
}

function failMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = false
}

function requireAuth(): boolean {
  if (auth.isAuthenticated) return true
  void router.push({ name: 'login', query: { redirect: route.fullPath } })
  return false
}

function applyApiUrl(): boolean {
  apiUrlWarn.value = httpSchemeWarning(apiUrl.value)
  const applied = setApiUrl(apiUrl.value, true)
  if (!applied) {
    failMsg('Некорректный API_URL: ожидается http(s)://…')
  }
  return applied
}

async function refreshStatus() {
  await refreshPendingCount().catch(() => {})
}

/** PULL: warm the offline data cache (desktop only — warmNow is No-op on web) */
async function onPull() {
  if (busy.value) return
  busy.value = true
  statusMsg.value = null
  try {
    if (!requireAuth()) return
    if (!applyApiUrl()) return
    if (isOffline.value) {
      failMsg('Нет соединения с сервером — PULL недоступен')
      return
    }
    const ran = await warmNow()
    if (ran) {
      okMsg('Данные прогреты')
    } else if (isOffline.value) {
      failMsg('Прогревка недоступна: нет сети')
    } else {
      failMsg('Прогревка уже идёт')
    }
    await refreshStatus()
  } finally {
    busy.value = false
  }
}

/**
 * PUSH: send the queued changes. Kept for compatibility with the old Sync
 * screen — the recommended path is "Синхронизировать всё".
 */
async function onPush() {
  if (busy.value) return
  busy.value = true
  statusMsg.value = null
  try {
    await syncNow()
    const n = syncNotice.value
    if (n?.interrupted) {
      failMsg(`Сеть снова пропала: отправлено ${n.ok}, остальное в очереди`)
    } else if (n && n.failed > 0) {
      failMsg(`Отправлено ${n.ok}, ошибок ${n.failed}. Повторите или пропустите ошибки`)
    } else if (n) {
      okMsg(`Отправлено изменений: ${n.ok}`)
    } else {
      okMsg('Нечего отправлять')
    }
    await refreshStatus()
  } finally {
    busy.value = false
  }
}

/** "Синхронизировать всё": PUSH (send the queue) → PULL (warmup) */
async function onSyncAll() {
  if (busy.value) return
  busy.value = true
  statusMsg.value = null
  try {
    if (!requireAuth()) return
    if (!applyApiUrl()) return
    if (isOffline.value) {
      failMsg('Нет соединения с сервером — синхронизация недоступна')
      return
    }
    const res = await syncAll()
    const n = syncNotice.value
    const parts: string[] = []
    if (res.pushed) parts.push(`отправлено изменений: ${n?.ok ?? 0}`)
    if (res.pulled) parts.push('данные скачаны')
    if (parts.length > 0) {
      okMsg('Синхронизация завершена: ' + parts.join(', '))
    } else if (n && n.failed > 0) {
      failMsg(`Отправлено ${n.ok}, ошибок ${n.failed}. Повторите или пропустите ошибки`)
    } else {
      okMsg('Синхронизация завершена: отправлять и скачивать нечего')
    }
    await refreshStatus()
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  apiUrl.value = getApiUrl() ?? ''
  void refreshStatus()
  refreshTimer = window.setInterval(refreshStatus, 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer != null) window.clearInterval(refreshTimer)
})
</script>

<template>
  <section class="sp">
    <h2 class="sp-title">Пульт</h2>

    <div class="sp-card">
      <h3 class="sp-card-title">Синхронизация данных</h3>

      <div class="sp-status-rows">
        <div class="sp-row">
          <span class="sp-label">Соединение</span>
          <span class="sp-value" :class="isOffline ? 'off' : 'on'">
            {{ connectionLabel }}
          </span>
        </div>
        <div class="sp-row">
          <span class="sp-label">Ожидают отправки</span>
          <span class="sp-value">{{ pendingCount }}</span>
        </div>
        <div class="sp-row">
          <span class="sp-label">Источник API_URL</span>
          <span class="sp-value">{{ hasApiUrlOverride() ? 'задан вручную' : 'по умолчанию' }}</span>
        </div>
      </div>

      <div v-if="warmupProgress != null" class="warm-progress" role="progressbar" :aria-valuenow="warmupProgress">
        <div class="warm-bar">
          <div class="warm-fill" :style="{ width: warmupProgress + '%' }" />
        </div>
        <span class="warm-label">Скачивание данных: {{ warmupProgress }}%</span>
      </div>

      <div v-if="pushProgress != null" class="warm-progress" role="progressbar" :aria-valuenow="pushPercent">
        <div class="warm-bar">
          <div class="warm-fill warm-fill--push" :style="{ width: pushPercent + '%' }" />
        </div>
        <span class="warm-label">Отправка изменений: {{ pushProgress.done }} из {{ pushProgress.total }}</span>
      </div>

      <div class="sp-actions">
        <button type="button" class="sp-btn" :disabled="busy || isOffline" @click="onPull">
          PULL — скачать данные
        </button>
        <button type="button" class="sp-btn accent" :disabled="busy" @click="onPush">
          {{ pendingLabel }}
        </button>
      </div>

      <button type="button" class="sp-btn accent" :disabled="busy || isOffline" @click="onSyncAll">
        Синхронизировать всё (PUSH → PULL)
      </button>

      <p v-if="statusMsg" class="sp-msg" :class="{ ok: statusOk }">{{ statusMsg }}</p>
    </div>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.sp-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 20px;
}

.sp-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
  padding: 20px;
}

.sp-card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 16px;
}

.sp-status-rows {
  margin-bottom: 6px;
}

.sp-row {
  display: flex;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid var(--ui-border);
  font-size: 13px;
}

.sp-row:last-child {
  border-bottom: none;
}

.sp-label {
  color: var(--ui-text-muted);
}

.sp-value {
  font-weight: 600;
  color: var(--ui-text);
}

.sp-value.on {
  color: var(--ui-success);
}

.sp-value.off {
  color: var(--ui-warning);
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

.sp-btn.accent {
  background: var(--ui-success);
}

.sp-btn.accent:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-success) 88%, black);
}

.sp-actions .sp-btn {
  flex: 1;
  margin-top: 14px;
}

.warm-progress {
  margin: 4px 0 2px;
}

.warm-bar {
  height: 8px;
  border-radius: 999px;
  background: var(--ui-surface-3);
  overflow: hidden;
}

.warm-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--ui-accent);
  transition: width var(--ui-duration) ease;
}

.warm-fill--push {
  background: var(--ui-success);
}

.warm-label {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ui-text-2);
  text-align: right;
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
