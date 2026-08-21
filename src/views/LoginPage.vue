<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../store'
import { PasswordField } from '../components/common'

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

function getError(): string | null {
  return localError.value || auth.error
}

async function onSubmit() {
  localError.value = null

  if (!username.value || !password.value) {
    localError.value = 'Заполните все поля'
    return
  }
  const ok = await auth.login(username.value, password.value)
  if (ok) goToRedirect()
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

      <form class="lp-form" @submit.prevent="onSubmit">
        <label class="lp-field">
          <span>Логин</span>
          <input v-model="username" type="text" autocomplete="username" placeholder="например, ivanov" />
        </label>

        <PasswordField v-model="password" label="Пароль" autocomplete="current-password" placeholder="••••••••" />

        <p v-if="getError()" class="lp-error">{{ getError() }}</p>

        <button type="submit" class="lp-btn" :disabled="auth.loading">
          {{ auth.loading ? 'Подождите…' : 'Войти →' }}
        </button>
      </form>

      <RouterLink to="/login/settings" class="lp-settings-link">⚙ Настройки сервера</RouterLink>
    </div>
  </div>
</template>

<style src="./LoginPage.css" scoped></style>