<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../store'
import { PasswordField, PasswordRequirements } from '../components/common'
import { passwordRules, validatePassword } from '../composables/usePasswordValidation'

const auth = useAuthStore()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changeMsg = ref<string | null>(null)
const changeOk = ref(false)

const passwordChecks = passwordRules()

const newPasswordValid = computed(() => validatePassword(newPassword.value, passwordChecks))
const passwordConfirmed = computed(() => confirmPassword.value === newPassword.value)

interface ProfileField {
  label: string
  value: string
}

// Реальный профиль текущего пользователя, полученный из API (auth.user)
const profile = computed<ProfileField[]>(() => {
  const u = auth.user
  return [
    { label: 'Логин', value: u?.username || '—' },
    { label: 'Имя', value: u?.name || '—' },
    { label: 'Роль', value: u?.role || '—' },
    { label: 'ID', value: u?.id != null ? String(u.id) : '—' },
  ]
})

onMounted(() => {
  const id = auth.user?.id
  if (id != null) auth.fetchProfile(id)
})

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
    <h2 class="pf-title">Профиль</h2>

    <div class="pf-cards">
      <div class="pf-card">
        <div v-for="field in profile" :key="field.label" class="pf-row">
          <span class="pf-label">{{ field.label }}</span>
          <span class="pf-value">{{ field.value }}</span>
        </div>
      </div>

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
  </section>
</template>

<style scoped>
.pf-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 20px;
}

.pf-cards {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
}

.pf-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.pf-row {
  display: flex;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}
.pf-row:last-child { border-bottom: none; }

.pf-label {
  color: #888;
}
.pf-value {
  font-weight: 600;
  color: #333;
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

.pf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #444;
}

.pf-field input {
  padding: 11px 14px;
  border: 1px solid #d0d4da;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 400;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.pf-field input:focus {
  outline: none;
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.pf-msg {
  font-size: 13px;
  color: #d93025;
}
.pf-msg.ok {
  color: #188038;
}
.pf-msg.warn {
  color: #b26a00;
  margin-bottom: 4px;
}

.pf-btn {
  margin-top: 18px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: #1a73e8;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.pf-btn:hover:not(:disabled) {
  background: #1765cc;
}
.pf-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.pf-btn.ghost {
  background: #f2f2f2;
  color: #444;
}
.pf-btn.ghost:hover:not(:disabled) {
  background: #e6e6e6;
}
.pf-btn.accent {
  background: #188038;
}
.pf-btn.accent:hover:not(:disabled) {
  background: #146b30;
}
</style>
