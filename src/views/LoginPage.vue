<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../store'
import { PasswordField, PasswordRequirements } from '../components/common'
import { passwordRules, validatePassword } from '../composables/usePasswordValidation'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const mode = ref<'login' | 'register'>('login')

// Поля для входа
const username = ref('')
const password = ref('')

// Поля для регистрации
const regLastName = ref('')
const regFirstName = ref('')
const regMiddleName = ref('')
const regUsername = ref('')
const regPassword = ref('')
const regPasswordConfirm = ref('')

const localError = ref<string | null>(null)

const passwordChecks = passwordRules()

const passwordValid = computed(() => validatePassword(regPassword.value, passwordChecks))
const passwordConfirmed = computed(() => regPasswordConfirm.value === regPassword.value)

const features = [
  { icon: '📈', label: 'Диаграммы Гантта', desc: 'Наглядное планирование проектов' },
  { icon: '👥', label: 'Ресурсы', desc: 'Управление загрузкой команд' },
  { icon: '🎯', label: 'Задачи', desc: 'Контроль сроков и статусов' },
]

const modeTabs = [
  { value: 'login', label: 'Вход' },
  { value: 'register', label: 'Регистрация' },
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
    if (
      !regLastName.value ||
      !regFirstName.value ||
      !regUsername.value ||
      !regPassword.value ||
      !regPasswordConfirm.value
    ) {
      localError.value = 'Заполните все поля'
      return
    }
    if (!passwordValid.value) {
      localError.value = 'Пароль не соответствует требованиям'
      return
    }
    if (!passwordConfirmed.value) {
      localError.value = 'Пароли не совпадают'
      return
    }
    const ok = await auth.register(
      regUsername.value,
      regPassword.value,
      regLastName.value,
      regFirstName.value,
      regMiddleName.value,
    )
    if (ok) goToRedirect()
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

          <PasswordField v-model="password" label="Пароль" autocomplete="current-password" placeholder="••••••••" />
        </template>

        <!-- РЕГИСТРАЦИЯ -->
        <template v-else-if="mode === 'register'">
          <label class="lp-field">
            <span>Фамилия</span>
            <input v-model="regLastName" type="text" autocomplete="family-name" placeholder="Иванов" />
          </label>
          <label class="lp-field">
            <span>Имя</span>
            <input v-model="regFirstName" type="text" autocomplete="given-name" placeholder="Иван" />
          </label>
          <label class="lp-field">
            <span>Отчество</span>
            <input v-model="regMiddleName" type="text" autocomplete="additional-name" placeholder="Иванович (необязательно)" />
          </label>
          <label class="lp-field">
            <span>Логин</span>
            <input v-model="regUsername" type="text" autocomplete="username" placeholder="например, ivanov" />
          </label>
          <PasswordField
            v-model="regPassword"
            label="Пароль"
            autocomplete="new-password"
            placeholder="Придумайте пароль"
          />
          <PasswordField
            v-model="regPasswordConfirm"
            label="Подтверждение пароля"
            autocomplete="new-password"
            placeholder="Повторите пароль"
          />
          <PasswordRequirements :model-value="regPassword" :rules="passwordChecks" />
        </template>

        <p v-if="getError()" class="lp-error">{{ getError() }}</p>

        <button type="submit" class="lp-btn" :disabled="auth.loading">
          {{ auth.loading ? 'Подождите…' : (mode === 'login' ? 'Войти →' : 'Создать аккаунт') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style src="./LoginPage.css" scoped></style>
