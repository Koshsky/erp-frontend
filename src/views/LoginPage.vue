<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../store'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const mode = ref<'login' | 'register' | 'change'>('login')

// Поля для входа
const username = ref('')
const password = ref('')
const showPassword = ref(false)

// Поля для регистрации
const regName = ref('')
const regUsername = ref('')
const regPassword = ref('')

// Поля для смены пароля
const oldPassword = ref('')
const newPassword = ref('')
const showNewPassword = ref(false)

const localError = ref<string | null>(null)

const features = [
  { icon: '📈', label: 'Диаграммы Гантта', desc: 'Наглядное планирование проектов' },
  { icon: '👥', label: 'Ресурсы', desc: 'Управление загрузкой команд' },
  { icon: '🎯', label: 'Задачи', desc: 'Контроль сроков и статусов' },
]

const modeTabs = [
  { value: 'login', label: 'Вход' },
  { value: 'register', label: 'Регистрация' },
  { value: 'change', label: 'Смена пароля' },
] as const

function getError(): string | null {
  return localError.value || auth.error
}

async function onSubmit() {
  localError.value = null

  if (mode.value === 'login') {
    if (!username.value || !password.value) {
      localError.value = 'Заполните все поля'
      return
    }
    const ok = await auth.login(username.value, password.value)
    if (ok) goToRedirect()
  } else if (mode.value === 'register') {
    if (!regName.value || !regUsername.value || !regPassword.value) {
      localError.value = 'Заполните все поля'
      return
    }
    const ok = await auth.register(regUsername.value, regPassword.value, regName.value)
    if (ok) goToRedirect()
  } else {
    if (!oldPassword.value || !newPassword.value) {
      localError.value = 'Заполните все поля'
      return
    }
    await auth.changePassword(oldPassword.value, newPassword.value)
    if (!auth.error) {
      localError.value = null
      oldPassword.value = ''
      newPassword.value = ''
    }
  }
}

function goToRedirect() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.push(redirect)
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

      <div class="lp-tabs">
        <button
          v-for="t in modeTabs"
          :key="t.value"
          type="button"
          class="lp-tab"
          :class="{ active: mode === t.value }"
          @click="mode = t.value"
        >
          {{ t.label }}
        </button>
      </div>

      <form class="lp-form" @submit.prevent="onSubmit">
        <!-- ВХОД -->
        <template v-if="mode === 'login'">
          <label class="lp-field">
            <span>Логин</span>
            <input v-model="username" type="text" autocomplete="username" placeholder="например, ivanov" />
          </label>

          <label class="lp-field">
            <span>Пароль</span>
            <div class="lp-input-wrap">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="••••••••"
              />
              <button type="button" class="lp-eye" @click="showPassword = !showPassword">
                {{ showPassword ? '🙈' : '👁' }}
              </button>
            </div>
          </label>
        </template>

        <!-- РЕГИСТРАЦИЯ -->
        <template v-else-if="mode === 'register'">
          <label class="lp-field">
            <span>Имя</span>
            <input v-model="regName" type="text" autocomplete="name" placeholder="Иван Иванов" />
          </label>
          <label class="lp-field">
            <span>Логин</span>
            <input v-model="regUsername" type="text" autocomplete="username" placeholder="например, ivanov" />
          </label>
          <label class="lp-field">
            <span>Пароль</span>
            <div class="lp-input-wrap">
              <input
                v-model="regPassword"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="••••••••"
              />
              <button type="button" class="lp-eye" @click="showPassword = !showPassword">
                {{ showPassword ? '🙈' : '👁' }}
              </button>
            </div>
          </label>
        </template>

        <!-- СМЕНА ПАРОЛЯ -->
        <template v-else>
          <label class="lp-field">
            <span>Старый пароль</span>
            <div class="lp-input-wrap">
              <input
                v-model="oldPassword"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="••••••••"
              />
              <button type="button" class="lp-eye" @click="showPassword = !showPassword">
                {{ showPassword ? '🙈' : '👁' }}
              </button>
            </div>
          </label>
          <label class="lp-field">
            <span>Новый пароль</span>
            <div class="lp-input-wrap">
              <input
                v-model="newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="••••••••"
              />
              <button type="button" class="lp-eye" @click="showNewPassword = !showNewPassword">
                {{ showNewPassword ? '🙈' : '👁' }}
              </button>
            </div>
          </label>
        </template>

        <p v-if="getError()" class="lp-error">{{ getError() }}</p>

        <button type="submit" class="lp-btn" :disabled="auth.loading">
          {{ auth.loading ? 'Подождите…' : (mode === 'login' ? 'Войти →' : mode === 'register' ? 'Создать аккаунт' : 'Сменить пароль') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style src="./LoginPage.css" scoped></style>
