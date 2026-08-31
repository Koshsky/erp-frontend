<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../store'
import { getApiUrl, setApiUrl, hasApiUrlOverride, httpSchemeWarning } from '../config'
import { autoSync, saveSyncSettings } from '../settings'
import { isElectron, hasDesktopPassword } from '../electron'
import { getSavedLogin, saveSyncCredentials } from '../syncCredentials'
import { warmNow, warmupProgress, lastWarmedAt } from '../offline/warmup'
import { syncNow, syncAll, syncNotice, dismissSyncNotice, retryFailed, discardFailed, lastPushAt } from '../offline/sync'
import { pendingCount, pushProgress, refreshPendingCount, getFailedEntries, queueItems, type QueueViewItem } from '../offline/outbox'
import { idbCount } from '../offline/db'
import { isOffline } from '../offline/state'
import { getAccessToken } from '../token'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const apiUrl = ref('')

const busy = ref(false)
const statusMsg = ref<string | null>(null)
const statusOk = ref(false)
/** Warning about the http scheme (the refresh Secure cookie does not work) */
const apiUrlWarn = ref<string | null>(null)

const failedEntries = ref<Array<{ method: string; url: string; message: string }>>([])
const cachedData = ref(0)

// === Sync account: login (localStorage) + password (safeStorage) ===
const savedLogin = ref(getSavedLogin() ?? '')
const credsSaved = ref(false)
const editingCreds = ref(false)
const credLogin = ref('')
const credPassword = ref('')
const credMsg = ref<string | null>(null)
const credOk = ref(false)

// === App / offline (moved from the profile screen) ===
const appVersion = ref('—')
/** Version of the running bundle (injected at build time; in dev — 'dev-...') */
const appBuildVersion = __APP_VERSION__
const cachedAssets = ref(0)
let refreshTimer: number | null = null

const pendingLabel = computed(() => (pendingCount.value > 0 ? `PUSH (${pendingCount.value})` : 'PUSH'))
const failedCount = computed(() => failedEntries.value.length)
const canRetry = computed(() => failedEntries.value.length > 0)

const lastWarmedLabel = computed(() =>
  lastWarmedAt.value != null
    ? new Date(lastWarmedAt.value).toLocaleString('ru-RU')
    : 'ещё не было',
)

const lastPushLabel = computed(() =>
  lastPushAt.value != null
    ? new Date(lastPushAt.value).toLocaleString('ru-RU')
    : 'ещё не было',
)

/** Percentage of the sent queue (for the PUSH progress bar) */
const pushPercent = computed(() => {
  const p = pushProgress.value
  if (!p || p.total === 0) return 0
  return Math.round((p.done / p.total) * 100)
})

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

function okMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = true
}

function failMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = false
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin)
    return u.pathname + u.search
  } catch {
    return url
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

/** Applies the URL from the field to the runtime config; false — invalid URL */
function applyApiUrl(): boolean {
  apiUrlWarn.value = httpSchemeWarning(apiUrl.value)
  const applied = setApiUrl(apiUrl.value, true)
  if (!applied) {
    failMsg('Некорректный API_URL: ожидается http(s)://…')
  }
  return applied
}

/** The "Save" button for API_URL: validates and saves to localStorage */
function onSaveApiUrl(): boolean {
  statusMsg.value = null
  if (!applyApiUrl()) return false
  okMsg('API_URL сохранён')
  return true
}

/** Sync operations require an active session — otherwise redirect to /login */
function requireAuth(): boolean {
  if (auth.isAuthenticated) return true
  void router.push({ name: 'login', query: { redirect: route.fullPath } })
  return false
}

async function refreshStatus() {
  await refreshPendingCount().catch(() => {})
  failedEntries.value = (await getFailedEntries().catch(() => [])).map((e) => ({
    method: e.method,
    url: e.url,
    message: e.message,
  }))
  cachedData.value = await idbCount('cache').catch(() => 0)
  savedLogin.value = getSavedLogin() ?? ''
  credsSaved.value = await hasDesktopPassword()
  await refreshAppInfo()
}

/** Build version and offline cache sizes (for the "App and offline" card) */
async function refreshAppInfo() {
  try {
    const res = await fetch('/precache-manifest.json')
    if (res.ok) {
      const data = (await res.json()) as { version?: string }
      appVersion.value = data.version ?? '—'
    }
  } catch {
    // offline — the build version is not critical
  }
  try {
    const cacheNames = await caches.keys()
    let count = 0
    for (const name of cacheNames) {
      const c = await caches.open(name)
      const keys = await c.keys()
      count += keys.filter((r) => r.url.includes('/assets/')).length
    }
    cachedAssets.value = count
  } catch {
    cachedAssets.value = 0
  }
}

/** Direct server availability check (does not touch the offline cache): any status < 500 means alive */
async function probeConnection(): Promise<boolean> {
  const base = getApiUrl()
  if (!base) return false
  const id = auth.user?.id ?? ''
  try {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 5000)
    try {
      const token = getAccessToken()
      const res = await fetch(`${base}/user/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
        signal: ctrl.signal,
      })
      return res.status < 500
    } finally {
      window.clearTimeout(timer)
    }
  } catch {
    return false
  }
}

async function onCheck() {
  if (busy.value) return
  busy.value = true
  statusMsg.value = null
  try {
    if (!requireAuth()) return
    if (!applyApiUrl()) return
    const reachable = await probeConnection()
    if (!reachable) {
      failMsg('Сервер недоступен по указанному API_URL')
      return
    }
    okMsg(`Соединение установлено. Пользователь: ${auth.user?.username ?? '—'}`)
    await refreshStatus()
  } finally {
    busy.value = false
  }
}

/** The "Change" button of the sync account: opens the login/password form */
function onEditCreds() {
  credMsg.value = null
  editingCreds.value = true
  credLogin.value = savedLogin.value
  credPassword.value = ''
}

function onCancelCreds() {
  credMsg.value = null
  editingCreds.value = false
}

/** "Save and verify": logging in checks the pair, then we save the sync credentials */
async function onSaveCreds() {
  if (busy.value) return
  credMsg.value = null
  const login = credLogin.value.trim()
  if (!login || !credPassword.value) {
    credMsg.value = 'Заполните логин и пароль'
    credOk.value = false
    return
  }
  busy.value = true
  try {
    const ok = await auth.login(login, credPassword.value)
    if (ok) {
      await saveSyncCredentials(login, credPassword.value)
      savedLogin.value = getSavedLogin() ?? ''
      credsSaved.value = await hasDesktopPassword()
      editingCreds.value = false
      credMsg.value = 'Креды сохранены, аккаунт проверен'
      credOk.value = true
    } else {
      credMsg.value = auth.error ?? 'Не удалось войти: проверьте логин и пароль'
      credOk.value = false
    }
  } finally {
    busy.value = false
  }
}

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

/** The "Sync all" button: PUSH (sending the queue) → PULL (warmup) */
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

watch(autoSync, saveSyncSettings)

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
    <h2 class="sp-title">Синхронизация</h2>

    <div class="sp-columns">
      <div class="sp-col">
        <div class="sp-card">
          <h3 class="sp-card-title">Аккаунт синка</h3>
          <p class="sp-hint">
            Операции PULL и PUSH выполняются от этого пользователя (и автосинк
            при запуске и возврате сети). Креды сохраняются автоматически при
            входе; здесь их можно проверить и сменить.
          </p>

          <div class="sp-status-rows">
            <div class="sp-row">
              <span class="sp-label">Логин</span>
              <span class="sp-value">{{ savedLogin || '—' }}</span>
            </div>
            <div class="sp-row">
              <span class="sp-label">Пароль</span>
              <span class="sp-value" :class="credsSaved ? 'on' : 'off'">
                {{ credsSaved ? 'сохранён (safeStorage)' : 'не сохранён' }}
              </span>
            </div>
          </div>

          <button v-if="!editingCreds" type="button" class="sp-btn ghost" :disabled="busy" @click="onEditCreds">
            Сменить креды синка
          </button>

          <div v-else class="sp-card-inner">
            <label class="sp-field">
              <span>Логин</span>
              <input v-model="credLogin" type="text" spellcheck="false" autocomplete="username" />
            </label>
            <label class="sp-field">
              <span>Пароль</span>
              <input v-model="credPassword" type="password" autocomplete="current-password" />
            </label>
            <p v-if="credMsg" class="sp-msg" :class="{ ok: credOk }">{{ credMsg }}</p>
            <div class="sp-actions sp-actions--tight">
              <button type="button" class="sp-btn sp-btn--sm" :disabled="busy" @click="onSaveCreds">
                {{ busy ? 'Проверка…' : 'Сохранить и проверить' }}
              </button>
              <button type="button" class="sp-btn sp-btn--sm ghost" :disabled="busy" @click="onCancelCreds">
                Отмена
              </button>
            </div>
          </div>
        </div>

        <div class="sp-card">
          <h3 class="sp-card-title">Подключение</h3>

          <label class="sp-field">
            <span>API_URL бэкенда</span>
            <input v-model="apiUrl" type="text" spellcheck="false" placeholder="https://host/api/v1" />
          </label>
          <p v-if="apiUrlWarn" class="sp-msg warn">{{ apiUrlWarn }}</p>
          <div class="sp-actions sp-actions--tight">
            <button type="button" class="sp-btn sp-btn--sm" :disabled="busy" @click="onSaveApiUrl">
              Сохранить
            </button>
          </div>

          <label class="sp-option">
            <input v-model="autoSync" type="checkbox" />
            <span>Автосинхронизация при запуске и возврате сети</span>
          </label>

          <div v-if="isElectron" class="sp-card-inner">
            <h4 class="sp-subtitle">Данные для автосинка</h4>
            <p class="sp-hint">
              Логин и пароль для автосинка сохраняются автоматически при входе
              в систему (пароль шифруется хранилищем ОС — safeStorage). При
              запуске приложение само восстановит сессию и выполнит
              синхронизацию.
            </p>
          </div>

          <p v-if="statusMsg" class="sp-msg" :class="{ ok: statusOk }">{{ statusMsg }}</p>

          <button type="button" class="sp-btn ghost" :disabled="busy" @click="onCheck">
            {{ busy ? 'Подождите…' : 'Проверить подключение' }}
          </button>
        </div>
      </div>

      <div class="sp-col">
        <div class="sp-card">
          <h3 class="sp-card-title">Синхронизация данных</h3>

          <div class="sp-status-rows">
            <div class="sp-row">
              <span class="sp-label">Соединение</span>
              <span class="sp-value" :class="isOffline ? 'off' : 'on'">
                {{ isOffline ? 'офлайн' : 'онлайн' }}
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

          <div v-if="canRetry" class="sp-errors">
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

          <p v-if="warmupProgress == null && lastWarmedAt != null" class="sp-hint">
            <RouterLink to="/planner">Перейти к планировщику</RouterLink>
          </p>
        </div>

        <div v-if="queueItems.length > 0" class="sp-card">
          <h3 class="sp-card-title">
            Очередь изменений
            <span class="sp-card-badge">{{ queueItems.length }}</span>
          </h3>
          <p v-if="isOffline" class="sp-hint queue-hint">
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

        <div class="sp-card">
          <h3 class="sp-card-title">Приложение и офлайн</h3>
          <div class="sp-status-rows">
            <div class="sp-row">
              <span class="sp-label">Версия приложения</span>
              <span class="sp-value">{{ appVersion }}</span>
            </div>
            <div class="sp-row">
              <span class="sp-label">Версия сборки (запущенная)</span>
              <span class="sp-value">{{ appBuildVersion }}</span>
            </div>
            <div class="sp-row">
              <span class="sp-label">Кэш ассетов</span>
              <span class="sp-value">{{ cachedAssets }} чанков</span>
            </div>
            <div class="sp-row">
              <span class="sp-label">Сохранённых данных</span>
              <span class="sp-value">{{ cachedData }} записей</span>
            </div>
            <div class="sp-row">
              <span class="sp-label">Последний PULL</span>
              <span class="sp-value">{{ lastWarmedLabel }}</span>
            </div>
            <div class="sp-row">
              <span class="sp-label">Последний PUSH</span>
              <span class="sp-value">{{ lastPushLabel }}</span>
            </div>
          </div>

          <p v-if="cachedData === 0" class="sp-msg warn">
            Кэш данных пуст. Для офлайна зайдите онлайн и нажмите «PULL».
          </p>
        </div>
      </div>
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

.sp-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

@media (max-width: 860px) {
  .sp-columns {
    grid-template-columns: 1fr;
  }
}

.sp-col {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
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

.sp-card-inner {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--ui-border);
}

.sp-subtitle {
  font-size: 14px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 6px;
}

.sp-hint-pwd {
  font-size: 12px;
  color: var(--ui-text-muted);
  margin: 4px 0 0;
}

.sp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-2);
}

.sp-field input {
  padding: 11px 14px;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  font-size: 14px;
  font-weight: 400;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}

.sp-field input:focus {
  outline: none;
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.sp-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  font-size: 13px;
  color: var(--ui-text-2);
  cursor: pointer;
}

.sp-msg {
  font-size: 13px;
  color: var(--ui-danger);
  margin: 10px 0 0;
}

.sp-msg.ok {
  color: var(--ui-success);
}

.sp-msg.warn {
  color: var(--ui-warning);
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

.sp-btn.accent {
  background: var(--ui-success);
}

.sp-btn.accent:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-success) 88%, black);
}

.sp-btn.danger {
  background: var(--ui-danger);
}

.sp-btn.danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-danger) 88%, black);
}

.sp-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.sp-actions--tight {
  margin-top: 0;
}

.sp-btn--sm {
  width: auto;
  margin-top: 0;
  padding: 9px 16px;
  font-size: 13px;
}

.sp-actions .sp-btn {
  flex: 1;
  margin-top: 14px;
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

.sp-errors {
  margin-top: 14px;
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

.sp-hint {
  margin: 12px 0 0;
  font-size: 13px;
}

.sp-hint a {
  color: var(--ui-accent);
  text-decoration: none;
}

.sp-hint a:hover {
  text-decoration: underline;
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

.sp-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp-card-badge {
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

.queue-hint {
  color: var(--ui-warning);
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

.queue-item {
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
</style>