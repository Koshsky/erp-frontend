<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuthStore } from '../store'
import { hasDesktopPassword } from '../electron'
import { getSavedLogin, saveSyncCredentials } from '../syncCredentials'
import { lastPullAt } from '../offline/connection'
import { lastPushAt } from '../offline/sync'
import { pendingCount, refreshPendingCount } from '../offline/outbox'
import { idbCount } from '../offline/db'
import { isOffline } from '../offline/state'

const auth = useAuthStore()

const busy = ref(false)
const statusMsg = ref<string | null>(null)
const statusOk = ref(false)

// === App / offline ===
const appVersion = ref('—')
/** Version of the running bundle (injected at build time; in dev — 'dev-...') */
const appBuildVersion = __APP_VERSION__
const cachedAssets = ref(0)
const cachedData = ref(0)

// === Sync account: login (localStorage) + password (safeStorage) ===
const savedLogin = ref(getSavedLogin() ?? '')
const credsSaved = ref(false)
const editingCreds = ref(false)
const credLogin = ref('')
const credPassword = ref('')
const credMsg = ref<string | null>(null)
const credOk = ref(false)

let refreshTimer: number | null = null

const lastPullLabel = computed(() =>
  lastPullAt.value != null
    ? new Date(lastPullAt.value).toLocaleString('ru-RU')
    : 'ещё не было',
)

const lastPushLabel = computed(() =>
  lastPushAt.value != null
    ? new Date(lastPushAt.value).toLocaleString('ru-RU')
    : 'ещё не было',
)

const connectionLabel = computed(() => (isOffline.value ? 'офлайн' : 'онлайн'))

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

async function refreshStatus() {
  await refreshPendingCount().catch(() => {})
  cachedData.value = await idbCount('cache').catch(() => 0)
  savedLogin.value = getSavedLogin() ?? ''
  credsSaved.value = await hasDesktopPassword()
  await refreshAppInfo()
}

function okMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = true
}

function failMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = false
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

onMounted(() => {
  void refreshStatus()
  refreshTimer = window.setInterval(refreshStatus, 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer != null) window.clearInterval(refreshTimer)
})
</script>

<template>
  <section class="ss">
    <h2 class="ss-title">Статус</h2>

    <div class="ss-card">
      <h3 class="ss-card-title">Соединение</h3>
      <div class="ss-status-rows">
        <div class="ss-row">
          <span class="ss-label">Соединение</span>
          <span class="ss-value" :class="isOffline ? 'off' : 'on'">
            {{ connectionLabel }}
          </span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Последний PULL</span>
          <span class="ss-value">{{ lastPullLabel }}</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Последний PUSH</span>
          <span class="ss-value">{{ lastPushLabel }}</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Ожидают отправки</span>
          <span class="ss-value">{{ pendingCount }}</span>
        </div>
      </div>
    </div>

    <div class="ss-card">
      <h3 class="ss-card-title">Приложение и офлайн</h3>
      <div class="ss-status-rows">
        <div class="ss-row">
          <span class="ss-label">Версия приложения</span>
          <span class="ss-value">{{ appVersion }}</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Версия сборки (запущенная)</span>
          <span class="ss-value">{{ appBuildVersion }}</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Кэш ассетов</span>
          <span class="ss-value">{{ cachedAssets }} чанков</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Сохранённых данных</span>
          <span class="ss-value">{{ cachedData }} записей</span>
        </div>
      </div>
      <p v-if="cachedData === 0" class="ss-msg warn">
        Кэш данных пуст. Для офлайна зайдите онлайн и нажмите «PULL» в «Пульте».
      </p>
    </div>

    <div class="ss-card">
      <h3 class="ss-card-title">Аккаунт синка</h3>
      <p class="ss-hint">
        Операции PULL и PUSH выполняются от этого пользователя (и автосинк
        при запуске и возврате сети). Креды сохраняются автоматически при
        входе; здесь их можно проверить и сменить.
      </p>

      <div class="ss-status-rows">
        <div class="ss-row">
          <span class="ss-label">Логин</span>
          <span class="ss-value">{{ savedLogin || '—' }}</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Пароль</span>
          <span class="ss-value" :class="credsSaved ? 'on' : 'off'">
            {{ credsSaved ? 'сохранён (safeStorage)' : 'не сохранён' }}
          </span>
        </div>
      </div>

      <button v-if="!editingCreds" type="button" class="ss-btn ghost" :disabled="busy" @click="onEditCreds">
        Сменить креды синка
      </button>

      <div v-else class="ss-card-inner">
        <label class="ss-field">
          <span>Логин</span>
          <input v-model="credLogin" type="text" spellcheck="false" autocomplete="username" />
        </label>
        <label class="ss-field">
          <span>Пароль</span>
          <input v-model="credPassword" type="password" autocomplete="current-password" />
        </label>
        <p v-if="credMsg" class="ss-msg" :class="{ ok: credOk }">{{ credMsg }}</p>
        <div class="ss-actions ss-actions--tight">
          <button type="button" class="ss-btn ss-btn--sm" :disabled="busy" @click="onSaveCreds">
            {{ busy ? 'Проверка…' : 'Сохранить и проверить' }}
          </button>
          <button type="button" class="ss-btn ss-btn--sm ghost" :disabled="busy" @click="onCancelCreds">
            Отмена
          </button>
        </div>
      </div>

      <p v-if="statusMsg" class="ss-status-msg" :class="{ ok: statusOk }">{{ statusMsg }}</p>
    </div>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.ss-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 20px;
}

.ss-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
  padding: 20px;
  margin-bottom: 24px;
}

.ss-card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 16px;
}

.ss-card-inner {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--ui-border);
}

.ss-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--ui-text-muted);
}

.ss-status-rows {
  margin-bottom: 6px;
}

.ss-row {
  display: flex;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid var(--ui-border);
  font-size: 13px;
}

.ss-row:last-child {
  border-bottom: none;
}

.ss-label {
  color: var(--ui-text-muted);
}

.ss-value {
  font-weight: 600;
  color: var(--ui-text);
}

.ss-value.on {
  color: var(--ui-success);
}

.ss-value.off {
  color: var(--ui-warning);
}

.ss-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-2);
}

.ss-field input {
  padding: 11px 14px;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  font-size: 14px;
  font-weight: 400;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}

.ss-field input:focus {
  outline: none;
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.ss-btn {
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

.ss-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}

.ss-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ss-btn.ghost {
  background: var(--ui-surface-3);
  color: var(--ui-text-2);
}

.ss-btn.ghost:hover:not(:disabled) {
  background: var(--ui-border);
}

.ss-btn--sm {
  width: auto;
  margin-top: 0;
  padding: 9px 16px;
  font-size: 13px;
}

.ss-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.ss-actions--tight {
  margin-top: 0;
}

.ss-actions .ss-btn {
  flex: 1;
  margin-top: 14px;
}

.ss-msg {
  font-size: 13px;
  color: var(--ui-danger);
  margin: 10px 0 0;
}

.ss-msg.ok {
  color: var(--ui-success);
}

.ss-msg.warn {
  color: var(--ui-warning);
}

.ss-status-msg {
  font-size: 13px;
  color: var(--ui-danger);
  margin: 14px 0 0;
}

.ss-status-msg.ok {
  color: var(--ui-success);
}
</style>
