<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '../store'
import { PasswordField, PasswordRequirements } from '../components/common'
import { passwordRules, validatePassword } from '../composables/usePasswordValidation'

const auth = useAuthStore()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changeMsg = ref<string | null>(null)
const changeOk = ref(false)

const passwordChecks = [
  ...passwordRules(),
  {
    id: 'no-login',
    label: 'не содержит ваш логин',
    test: (value: string) => {
      const login = auth.user?.username?.toLowerCase() ?? ''
      return login === '' || !value.toLowerCase().includes(login)
    },
  },
]

const newPasswordValid = computed(() => validatePassword(newPassword.value, passwordChecks))
const passwordConfirmed = computed(() => confirmPassword.value === newPassword.value)

async function onChangePassword() {
  changeMsg.value = null
  changeOk.value = false
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    changeMsg.value = 'Заполните все поля'
    return
  }
  if (!newPasswordValid.value) {
    changeMsg.value = 'Новый пароль не соответствует требованиям'
    return
  }
  if (!passwordConfirmed.value) {
    changeMsg.value = 'Новый пароль не совпадает с подтверждением'
    return
  }
  const ok = await auth.changePassword(oldPassword.value, newPassword.value)
  if (ok) {
    changeMsg.value = 'Пароль успешно изменён'
    changeOk.value = true
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } else {
    changeMsg.value = auth.error ?? 'Не удалось изменить пароль'
  }
}
</script>

<template>
  <section class="pf">
    <h2 class="pf-title">Редактирование профиля</h2>

    <div class="pf-cards">
      <div class="pf-card pw-form">
        <h3 class="pf-title sm">Смена пароля</h3>
        <form @submit.prevent="onChangePassword">
          <div class="pw-fields">
            <PasswordField v-model="oldPassword" label="Старый пароль" autocomplete="current-password" placeholder="••••••••" />
            <PasswordField v-model="newPassword" label="Новый пароль" autocomplete="new-password" placeholder="Придумайте новый пароль" />
            <PasswordField v-model="confirmPassword" label="Подтверждение пароля" autocomplete="new-password" placeholder="Повторите пароль" />
            <PasswordRequirements :model-value="newPassword" :rules="passwordChecks" />
          </div>

          <p v-if="changeMsg" class="pf-msg" :class="{ ok: changeOk }">{{ changeMsg }}</p>

          <button type="submit" class="pf-btn" :disabled="auth.loading">
            {{ auth.loading ? 'Сохранение…' : 'Сменить пароль' }}
          </button>
        </form>
      </div>
    </div>

    <RouterLink to="/profile" class="pf-back">← Назад к профилю</RouterLink>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.pf-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 20px;
}

.pf-cards {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
}

.pf-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  overflow: hidden;
}

.pf-title.sm {
  font-size: 18px;
  margin: 0 0 16px;
}

.pw-form {
  padding: 20px;
}

.pw-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pf-msg {
  margin-top: 14px;
  font-size: 13px;
  color: var(--ui-danger);
}
.pf-msg.ok {
  color: var(--ui-success);
}

.pf-btn {
  margin-top: 18px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--ui-duration);
}
.pf-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.pf-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pf-back {
  display: inline-block;
  margin-top: 14px;
  font-size: 13px;
  color: var(--ui-accent);
  text-decoration: none;
}
.pf-back:hover {
  text-decoration: underline;
}
</style>