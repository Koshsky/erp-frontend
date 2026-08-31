<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { PasswordDialog } from '../components/common'
import { useAppStore, useAuthStore, useRbacStore } from '../store'
import { compareByName, translitPhio } from '../utils'
import type { DtoAdminUserResponse, DtoCreateUserRequest, DtoUpdateUserRequest } from '@/api'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const auth = useAuthStore()
const rbac = useRbacStore()
const { adminUsers, adminUsersError, users } = storeToRefs(app)

/**
 * Role assignment is an admin-only business rule (service-enforced): a
 * non-admin holder of the user-edit right sees no role field, and the payload
 * never submits a role change — otherwise the backend would reject the save.
 */
const isAdmin = computed(() => auth.user?.role === 'admin')

/**
 * Dedicated route page for both create (users/new) and edit (users/:id/edit)
 * of an admin user. The mode is decided by the route name; the edit page loads
 * the user list itself (works on a direct URL / page reload) and shows an
 * error state instead of the form when the id is missing or unknown.
 */
const isEdit = computed(() => route.name === 'user-edit')

const editingUserId = computed(() => {
  const raw = route.params.id
  if (typeof raw !== 'string') return null
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
})

const form = reactive({
  lastName: '',
  firstName: '',
  middleName: '',
  login: '',
  role: 'worker',
  managerId: '', // '' — no manager
  position: '',
  hireDate: '',
  terminationDate: '',
})
/** The login field was edited manually — stop auto-filling from the full name */
const loginTouched = ref(false)

/** Error from the last submit (user-facing) */
const error = ref<string | null>(null)
const busy = ref(false)
/** Edit mode: the admin user list is being loaded before the form shows */
const loadingEdit = ref(isEdit.value && adminUsers.value.length === 0)
/** Edit mode: the user could not be loaded (bad id, unknown user, load failure) */
const missing = ref(false)
/** Manager id of the user as loaded — to detect a change on save */
const savedManagerId = ref<number | null>(null)
/** True after the first submit attempt — enables the validation message */
const submitAttempted = ref(false)

/** First field, focused on entry for an immediate keyboard flow */
const lastNameInput = ref<HTMLInputElement | null>(null)

// Live default login (create mode only): translit of the full name, updated as ФИО is typed
watch(
  () => [form.lastName, form.firstName, form.middleName] as const,
  () => {
    if (loginTouched.value || isEdit.value) return
    form.login = translitPhio(form.lastName, form.firstName, form.middleName)
  },
)

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  dp: 'Директор проектов',
  rp: 'Руководитель проекта',
  vp: 'Владелец процесса',
  worker: 'Работник',
}

const STATIC_ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

/** Roles from the /rbac/roles catalog; fallback — the static list. */
const roleOptions = computed(() =>
  rbac.roles.length
    ? rbac.roles.map((r) => ({ value: r.name ?? '', label: ROLE_LABELS[r.name ?? ''] ?? r.name ?? '' }))
    : STATIC_ROLE_OPTIONS,
)

/** Manager options: users with a non-worker role + "No manager" */
const managerOptions = computed(() => [
  { value: '', label: 'Без руководителя' },
  ...users.value
    .filter((u) => u.id != null && u.role !== 'worker')
    .sort(compareByName)
    .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
])

function fillForm(u: DtoAdminUserResponse) {
  form.lastName = u.last_name ?? ''
  form.firstName = u.first_name ?? ''
  form.middleName = u.middle_name ?? ''
  form.login = u.username ?? ''
  form.role = u.role ?? 'worker'
  form.managerId = u.manager_id != null ? String(u.manager_id) : ''
  form.position = u.position ?? ''
  form.hireDate = u.hire_date ?? ''
  form.terminationDate = u.termination_date ?? ''
  savedManagerId.value = u.manager_id ?? null
  // In edit mode the login is entered manually — no auto-fill
  loginTouched.value = true
}

onMounted(async () => {
  void rbac.ensureRoles()
  if (!users.value.length) void app.loadUsers()
  if (!isEdit.value) {
    await nextTick()
    lastNameInput.value?.focus()
    return
  }
  loadingEdit.value = adminUsers.value.length === 0
  await app.loadAdminUsers()
  loadingEdit.value = false
  const u = adminUsers.value.find((x) => x.id === editingUserId.value)
  if (u) fillForm(u)
  else missing.value = true
})

const canSubmit = computed(() => {
  if (busy.value) return false
  if (form.lastName.trim() === '' || form.firstName.trim() === '') return false
  if (isEdit.value && form.login.trim() === '') return false
  return true
})

/** User-facing hint shown after a submit attempt left the form invalid */
const validationMessage = computed(() => {
  if (!submitAttempted.value || canSubmit.value) return null
  if (form.lastName.trim() === '' || form.firstName.trim() === '') {
    return 'Заполните обязательные поля: Фамилия, Имя'
  }
  if (isEdit.value && form.login.trim() === '') return 'Заполните логин'
  return null
})

/** Generated password shown once after creation; close navigates back to the list */
const passwordModal = ref<{ password: string; caption: string } | null>(null)

function onPasswordClose() {
  passwordModal.value = null
  void router.push('/users')
}

async function onSubmit() {
  if (!canSubmit.value) {
    submitAttempted.value = true
    return
  }
  busy.value = true
  error.value = null
  try {
    const common = {
      last_name: form.lastName.trim(),
      first_name: form.firstName.trim(),
    } as const
    if (isEdit.value) {
      const id = editingUserId.value
      if (id == null) return
      // Empty strings clear the field (unlike undefined, which would keep it)
      const patch: DtoUpdateUserRequest = {
        ...common,
        middle_name: form.middleName.trim(),
        username: form.login.trim(),
        position: form.position.trim(),
      }
      // Role changes are admin-only (service-enforced); non-admin holders of
      // the user-edit right must not submit the role at all.
      if (isAdmin.value) patch.role = form.role
      if (form.hireDate) patch.hire_date = form.hireDate
      if (form.terminationDate) patch.termination_date = form.terminationDate
      const ok = await app.updateUser(id, patch)
      const nextManager = form.managerId === '' ? null : Number(form.managerId)
      if (ok && nextManager !== savedManagerId.value) await app.updateManager(id, nextManager)
      if (ok) {
        void router.push('/users')
      } else {
        error.value = adminUsersError.value
      }
      return
    }
    const payload: DtoCreateUserRequest = {
      ...common,
      middle_name: form.middleName.trim() || undefined,
      // Non-admin user_admin.create holders may only create workers.
      role: isAdmin.value ? form.role : 'worker',
      position: form.position.trim(),
    }
    const login = form.login.trim()
    // Send the login only if entered; an empty one lets the backend generate it
    // (transliteration of the last name, uniqueness ensured by a numeric suffix).
    if (login) payload.username = login
    if (form.hireDate) payload.hire_date = form.hireDate
    if (form.terminationDate) payload.termination_date = form.terminationDate
    if (form.managerId !== '') payload.manager_id = Number(form.managerId)
    const res = await app.createUser(payload)
    if (res && res.user) {
      if (res.password) {
        passwordModal.value = { password: res.password, caption: `Пользователь «${res.user.name}» создан` }
      } else {
        void router.push('/users')
      }
    } else {
      error.value = adminUsersError.value
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="ufp">
    <div class="ufp-head">
      <RouterLink to="/users" class="ufp-back">← К списку пользователей</RouterLink>
      <h2 class="ufp-title">{{ isEdit ? 'Редактировать пользователя' : 'Создать пользователя' }}</h2>
    </div>

    <!-- Edit mode: the user list is loading — show a placeholder, not an empty form -->
    <p v-if="loadingEdit" class="ufp-st">Загрузка...</p>

    <!-- Edit mode: user could not be loaded — error state instead of the form -->
    <div v-else-if="missing" class="ufp-st">
      <p class="ufp-error">{{ error || 'Пользователь не найден' }}</p>
    </div>

    <div v-else class="ufp-card">
      <label class="ufp-field">
        <span class="ufp-label">Фамилия *</span>
        <input ref="lastNameInput" v-model="form.lastName" type="text" class="ufp-input" autocomplete="off" />
      </label>
      <label class="ufp-field">
        <span class="ufp-label">Имя *</span>
        <input v-model="form.firstName" type="text" class="ufp-input" autocomplete="off" />
      </label>
      <label class="ufp-field">
        <span class="ufp-label">Отчество</span>
        <input v-model="form.middleName" type="text" class="ufp-input" autocomplete="off" />
      </label>
      <label class="ufp-field">
        <span class="ufp-label">Логин{{ isEdit ? ' *' : '' }}</span>
        <input
          v-model="form.login"
          type="text"
          class="ufp-input"
          autocomplete="off"
          placeholder="Автозаполняется из ФИО"
          @input="loginTouched = true"
        />
        <span v-if="!isEdit && !loginTouched" class="ufp-hint">Заполняется автоматически по ФИО (транслит); можно изменить</span>
      </label>
      <label v-if="isAdmin" class="ufp-field">
        <span class="ufp-label">Роль *</span>
        <select v-model="form.role" class="ufp-input ufp-select">
          <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </label>
      <label class="ufp-field">
        <span class="ufp-label">Руководитель</span>
        <select v-model="form.managerId" class="ufp-input ufp-select">
          <option v-for="opt in managerOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </label>
      <label class="ufp-field">
        <span class="ufp-label">Должность</span>
        <input v-model="form.position" type="text" class="ufp-input" placeholder="Свободный текст, например «Ведущий инженер»" />
      </label>
      <div class="ufp-row">
        <label class="ufp-field">
          <span class="ufp-label">Дата приёма</span>
          <input v-model="form.hireDate" type="date" class="ufp-input" />
        </label>
        <label class="ufp-field">
          <span class="ufp-label">Дата увольнения</span>
          <input v-model="form.terminationDate" type="date" class="ufp-input" />
        </label>
      </div>

      <p v-if="error" class="ufp-error" role="alert">{{ error }}</p>
      <p v-if="validationMessage" class="ufp-error" role="alert">{{ validationMessage }}</p>
      <p v-if="!isEdit" class="ufp-note">Пароль генерируется автоматически и будет показан один раз.</p>

      <div class="ufp-actions">
        <button type="button" class="ufp-btn" @click="router.push('/users')">Отмена</button>
        <button type="button" class="ufp-add" :disabled="!canSubmit" @click="onSubmit">
          {{
            busy
              ? isEdit
                ? 'Сохранение…'
                : 'Создание…'
              : isEdit
                ? 'Сохранить'
                : 'Создать'
          }}
        </button>
      </div>
    </div>

    <PasswordDialog
      :open="passwordModal !== null"
      :password="passwordModal?.password ?? ''"
      :caption="passwordModal?.caption ?? ''"
      @close="onPasswordClose"
    />
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.ufp-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.ufp-back {
  color: var(--ui-accent);
  text-decoration: none;
  font-size: 14px;
  white-space: nowrap;
}
.ufp-back:hover {
  text-decoration: underline;
}
.ufp-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
}
.ufp-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  padding: 24px;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ufp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ufp-label {
  font-size: 13px;
  color: var(--ui-text-2);
  font-weight: 500;
}
.ufp-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
}
.ufp-input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 18%, transparent);
}
.ufp-select {
  cursor: pointer;
}
.ufp-hint {
  font-size: 12px;
  color: var(--ui-text-muted);
}
.ufp-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.ufp-error {
  margin: 0;
  font-size: 13px;
  color: var(--ui-danger);
}
.ufp-note {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.ufp-st {
  color: var(--ui-text-2);
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.ufp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 2px;
}
.ufp-btn {
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  padding: 9px 18px;
  font-size: 14px;
  color: var(--ui-accent);
  cursor: pointer;
  white-space: nowrap;
}
.ufp-btn:hover {
  background: var(--ui-accent-soft);
}
.ufp-add {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  transition: background var(--ui-duration), opacity var(--ui-duration);
}
.ufp-add:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.ufp-add:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>