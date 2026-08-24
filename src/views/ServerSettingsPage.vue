<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { getServerBase, getApiUrl, setServerBase, httpSchemeWarning } from '../config'

/**
 * Экран настройки адреса сервера (до входа).
 * Позволяет задать, к какому бэкенду подключаться: пользователь вводит
 * базовый адрес сервера (https://localhost / https://erp.example.ru),
 * приложение добавляет /api/v1. Нужен в настольной версии, где адрес
 * бэкенда может отличаться от машины, на которой стоит exe.
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
        <RouterLink to="/login" class="ss-back">← Назад ко входу</RouterLink>
      </form>
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

.ss-back:hover {
  text-decoration: underline;
}
</style>
