<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { getServerBase, getApiUrl, setServerBase, httpSchemeWarning } from '../config'
import { isElectron } from '../electron'

/**
 * Экран настройки адреса сервера (до входа).
 * В настольной (Electron) версии позволяет задать, к какому бэкенду
 * подключаться: пользователь вводит базовый адрес сервера, приложение
 * добавляет /api/v1 (адрес на машине с exe может отличаться).
 * В браузерной версии смена адреса невозможна (same-origin nginx-прокси,
 * CSP connect-src 'self', refresh-кука не переживает смену origin) — экран
 * показывает развёрнутый адрес как информацию, без возможности редактирования.
 */

const router = useRouter()

const serverBase = ref(getServerBase())
const busy = ref(false)
const msg = ref<string | null>(null)
const ok = ref(false)
/** Предупреждение про http-схему (Secure-кука refresh не работает) */
const warning = ref<string | null>(null)

function applyAndStore(url: string): boolean {
  const saved = setServerBase(url, true)
  warning.value = httpSchemeWarning(url)
  if (!saved) {
    msg.value = 'Некорректный адрес: ожидается http(s)://host (или http(s)://host:port)'
    ok.value = false
  }
  return saved
}

/** Живой ли сервер: POST /auth/login вернёт <500 (401 «плохие креды» тоже подходит) */
async function probeServer(): Promise<boolean> {
  const base = getApiUrl()
  if (!base) return false
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'probe', password: 'probe' }),
      signal: ctrl.signal,
    })
    return res.status < 500
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

async function onCheck() {
  if (busy.value) return
  busy.value = true
  msg.value = null
  try {
    if (!applyAndStore(serverBase.value)) return
    const reachable = await probeServer()
    if (reachable) {
      msg.value = 'Сервер доступен'
      ok.value = true
    } else {
      msg.value =
        'Сервер недоступен по указанному адресу. Проверьте URL и то, что сервер запущен.'
      ok.value = false
    }
  } finally {
    busy.value = false
  }
}

function onSave() {
  if (!applyAndStore(serverBase.value)) return
  void router.push({ name: 'login' })
}
</script>

<template>
  <div class="lp ss">
    <div class="lp-brand">
      <div class="lp-logo">MVS</div>
      <h1 class="lp-btitle">Настройки сервера</h1>
      <p class="lp-bsub">Укажите адрес вашего сервера MVS ERP</p>

      <ul class="lp-features">
        <li class="feature">
          <span class="feature-icon">🌐</span>
          <span class="feature-body">
            <strong>Локальный сервер</strong>
            <em>например, https://localhost</em>
          </span>
        </li>
        <li class="feature">
          <span class="feature-icon">🏢</span>
          <span class="feature-body">
            <strong>Удалённый сервер</strong>
            <em>например, https://erp.example.ru</em>
          </span>
        </li>
        <li class="feature">
          <span class="feature-icon">🔐</span>
          <span class="feature-body">
            <strong>Безопасно</strong>
            <em>приложение само добавит /api/v1</em>
          </span>
        </li>
      </ul>
    </div>

    <div class="lp-form-side">
      <h2 class="lp-title">Адрес сервера</h2>

      <!-- Electron: адрес можно задать (exe подключается к внешнему бэкенду) -->
      <template v-if="isElectron">
        <p class="lp-subtitle">Адрес подключаемого бэкенда. Сохраняется на этом устройстве.</p>

        <form class="lp-form" @submit.prevent="onSave">
          <label class="lp-field">
            <span>Адрес сервера</span>
            <input
              v-model="serverBase"
              type="text"
              spellcheck="false"
              autocomplete="url"
              placeholder="https://localhost"
            />
          </label>

          <p v-if="warning" class="lp-warn">{{ warning }}</p>
          <p v-if="msg" class="lp-error" :class="{ ok }">{{ msg }}</p>

          <button type="button" class="lp-btn" :disabled="busy" @click="onCheck">
            {{ busy ? 'Проверяю…' : 'Проверить соединение' }}
          </button>
          <button type="submit" class="lp-btn" :disabled="busy">Сохранить и перейти ко входу</button>
        </form>
      </template>

      <!-- Web: адрес задаётся деплоем (same-origin nginx-прокси) — только информация -->
      <template v-else>
        <p class="lp-subtitle">
          Браузерная версия подключается к API того же адреса, с которого открыта
          (nginx-прокси /api/v1). Адрес задаётся при развёртывании и изменению не подлежит.
        </p>

        <div class="ss-info">
          <span class="ss-label">Сервер</span>
          <code class="ss-value">{{ serverBase || '—' }}</code>
        </div>
        <div class="ss-info">
          <span class="ss-label">API</span>
          <code class="ss-value">{{ getApiUrl() || '—' }}</code>
        </div>
      </template>

      <RouterLink to="/login" class="ss-back">← Назад ко входу</RouterLink>
    </div>
  </div>
</template>

<style src="./LoginPage.css" scoped></style>

<style scoped>
/* Ошибка с признаком успеха — зелёным */
.lp-error.ok {
  color: #188038;
}

.ss-back {
  display: block;
  text-align: center;
  margin-top: 12px;
  font-size: 13px;
  color: #1a73e8;
  text-decoration: none;
}

/* Информационная карточка адреса (web: смена сервера недоступна) */
.ss-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  border: 1px solid #e4e9f0;
  border-radius: 10px;
  background: #fafbfc;
  margin-bottom: 10px;
  font-size: 13px;
}

.ss-label {
  color: #888;
  font-weight: 600;
  white-space: nowrap;
}

.ss-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #333;
  word-break: break-all;
  text-align: right;
}

.ss-back:hover {
  text-decoration: underline;
}
</style>
