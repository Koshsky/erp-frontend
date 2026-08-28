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

// Поля для входа
const username = ref('')
const password = ref('')

const localError = ref<string | null>(null)

const features = [
  { icon: '📈', label: 'Диаграммы Гантта', desc: 'Наглядное планирование проектов' },
  { icon: '👥', label: 'Ресурсы', desc: 'Управление загрузкой команд' },
  { icon: '🎯', label: 'Задачи', desc: 'Контроль сроков и статусов' },
]

const offline = computed(() => isElectron && isOffline.value)
/** Адрес сервера для показа на странице входа (если задан) */
const serverBase = computed(() => getServerBase())
/** Одна кнопка входа: лейбл меняется по сети, поведение — в onSubmit */
const submitLabel = computed(() =>
  auth.loading ? 'Подождите…' : offline.value ? 'Войти офлайн' : 'Войти →',
)

// === Пинг сервера: символ-кнопка + сигнализатор соединения ===
const pinging = ref(false)
/** Результат пинга: null — ещё не было, true — доступен, false — недоступен */
const pingOk = ref<boolean | null>(null)
// Если сервер уже известен как недоступный (офлайн) — индикатор сразу красный
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

/** Пинг бэкенда (GET /health, публичный): любой статус <500 = жив */
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
 * Офлайн-вход: локальная сессия без токена (данные из кэша, мутации в
 * очередь), пароль не проверяется и не сохраняется. Идентичность: введённый
 * логин → сохранённый профиль → логин автосинка (см. префилл ниже).
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
    // Desktop: креды успешного входа — safeguard-креды автосинка (пароль в
    // safeStorage). Сохраняем только верифицированный пароль.
    if (isElectron) {
      try {
        await saveSyncCredentials(username.value, password.value)
      } catch {
        // автосинк просто останется без пароля — не критично
      }
    }
    goToRedirect()
  }
}

function goToRedirect() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.push(redirect)
}

// В офлайне подставляем сохранённый логин автосинка — пользователю остаётся
// только нажать одну кнопку.
if (isElectron && isOffline.value && !username.value) {
  username.value = getSavedLogin() ?? ''
}
</script>

<template>
  <div class="lp">
    <div class="lp-brand">
      <div class="lp-logo">MVS</div>
      <h1 class="lp-btitle">MVS ERP</h1>
      <p class="lp-bsub">Система планирования проектов</p>

      <ul class="lp-features">
        <li v-for="f in features" :key="f.label" class="feature">
          <span class="feature-icon">{{ f.icon }}</span>
          <span class="feature-body">
            <strong>{{ f.label }}</strong>
            <em>{{ f.desc }}</em>
          </span>
        </li>
      </ul>
    </div>

    <div class="lp-form-side">
      <h2 class="lp-title">Вход в систему</h2>
      <p class="lp-subtitle">Введите учётные данные для продолжения</p>

      <form class="lp-form" @submit.prevent="onSubmit">
        <label class="lp-field">
          <span>Логин</span>
          <input v-model="username" type="text" autocomplete="username" placeholder="например, ivanov" />
        </label>

        <PasswordField v-model="password" label="Пароль" autocomplete="current-password" placeholder="••••••••" />

        <p v-if="offline" class="lp-offline-hint">Сервер недоступен: вход офлайн не требует сети</p>
        <p v-if="getError()" class="lp-error">{{ getError() }}</p>

        <button type="submit" class="lp-btn" :disabled="auth.loading">
          {{ submitLabel }}
        </button>
      </form>

      <!-- Строка «Сервер: …» + пинг и настройки сервера — только в настольной
           (Electron) сборке. В онлайн (веб) версии адрес задаётся деплоем,
           смена сервера невозможна — блок не показываем целиком. -->
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

<style src="./LoginPage.css" scoped></style>