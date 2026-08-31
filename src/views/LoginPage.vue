<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../store'
import { PasswordField } from '../components/common'
import { isOffline, probeBackend } from '../offline/state'
import { isElectron } from '../electron'
import { getSavedLogin, saveSyncCredentials } from '../syncCredentials'
import { getServerBase } from '../config'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

// Login fields
const username = ref('')
const password = ref('')

const localError = ref<string | null>(null)

const offline = computed(() => isElectron && isOffline.value)
/** Server address to show on the login page (if set) */
const serverBase = computed(() => getServerBase())
/** Single login button: the label depends on the network state, the behavior is in onSubmit */
const submitLabel = computed(() =>
  auth.loading ? 'Подождите…' : offline.value ? 'Войти офлайн' : 'Войти →',
)

// === Server ping: symbol button + connection indicator ===
const pinging = ref(false)
/** Ping result: null — not attempted yet, true — reachable, false — unreachable */
const pingOk = ref<boolean | null>(null)
// If the server is already known to be unreachable (offline) — the indicator is red right away
if (isElectron && isOffline.value) pingOk.value = false

const pingSymbol = computed(() => (pinging.value ? '⏳' : '⇄'))

const pingClass = computed(() => {
  if (pinging.value) return 'pinging'
  if (pingOk.value === true) return 'ping-ok'
  if (pingOk.value === false) return 'ping-fail'
  return ''
})

const pingTitle = computed(() => {
  if (pinging.value) return 'Проверка соединения…'
  if (pingOk.value === true) return 'Сервер доступен'
  if (pingOk.value === false) return 'Сервер недоступен'
  return 'Проверить соединение с сервером'
})

/** Ping the backend (GET /health, public): any status < 500 means alive */
async function onPing() {
  if (pinging.value) return
  pinging.value = true
  pingOk.value = null
  try {
    pingOk.value = await probeBackend()
  } catch {
    pingOk.value = false
  } finally {
    pinging.value = false
  }
}

function getError(): string | null {
  return localError.value || auth.error
}

/**
 * Offline login: a local session without a token (data from the cache, mutations
 * go to a queue), the password is neither checked nor saved. Identity: typed
 * login → saved profile → autosync login (see the prefilled value below).
 */
function enterOffline() {
  const typed = username.value.trim()
  const identity = typed || auth.user?.username || getSavedLogin()
  if (!identity) {
    localError.value = 'Нет сохранённой сессии: войдите онлайн хотя бы один раз'
    return
  }
  auth.enterOffline(identity)
  goToRedirect()
}

async function onSubmit() {
  localError.value = null
  if (offline.value) {
    enterOffline()
    return
  }

  if (!username.value || !password.value) {
    localError.value = 'Заполните все поля'
    return
  }
  const ok = await auth.login(username.value, password.value)
  if (ok) {
    // Desktop: credentials of a successful login — the autosync safeguard credentials (password in
    // safeStorage). Only the verified password is saved.
    if (isElectron) {
      try {
        await saveSyncCredentials(username.value, password.value)
      } catch {
        // autosync will simply remain without a password — not critical
      }
    }
    goToRedirect()
  }
}

function goToRedirect() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.push(redirect)
}

// Offline: prefill the saved autosync login — the user only needs
// to press one button.
if (isElectron && isOffline.value && !username.value) {
  username.value = getSavedLogin() ?? ''
}
</script>

<template>
  <div class="lp">
    <div class="lp-form-side">
      <div class="lp-brand-head">
        <h1 class="lp-btitle">MVS ERP</h1>
        <p class="lp-bsub">Система планирования проектов</p>
      </div>

      <form class="lp-form" @submit.prevent="onSubmit">
        <label class="lp-field">
          <span>Логин</span>
          <input v-model="username" type="text" autocomplete="username" placeholder="ivanov" />
        </label>

        <PasswordField v-model="password" label="Пароль" autocomplete="current-password" placeholder="••••••••" />

        <p v-if="offline" class="lp-offline-hint">Сервер недоступен: вход офлайн не требует сети</p>
        <p v-if="getError()" class="lp-error">{{ getError() }}</p>

        <button type="submit" class="lp-btn" :disabled="auth.loading">
          {{ submitLabel }}
        </button>
      </form>

      <!-- The "Server: …" row + ping and server settings — desktop (Electron)
           build only. In the online (web) version the address is set by the
           deployment and cannot be changed — the block is not shown at all. -->
      <div v-if="isElectron && serverBase" class="lp-server-row">
        <span class="lp-server">Сервер: {{ serverBase }}</span>
        <button
          type="button"
          class="lp-ping"
          :class="pingClass"
          :disabled="pinging"
          :title="pingTitle"
          :aria-label="pingTitle"
          @click="onPing"
        >
          {{ pingSymbol }}
        </button>
      </div>

      <RouterLink v-if="isElectron" to="/login/settings" class="lp-settings-link">⚙ Настройки сервера</RouterLink>
    </div>
  </div>
</template>

<style scoped>
@import '../styles/tokens.css';
</style>

<style src="./LoginPage.css" scoped></style>

<style scoped>
/* Login-only overrides: single-column centered card.
   LoginPage.css stays untouched — it is shared with the server settings page. */
.lp {
  grid-template-columns: 1fr;
  max-width: 420px;
}

.lp-brand-head .lp-bsub {
  margin-bottom: 24px; /* tighten the gap before the form heading */
}
</style>