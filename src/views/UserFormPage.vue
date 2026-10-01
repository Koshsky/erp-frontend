<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { HintButton, ConfirmDialog, PasswordDialog, UserPermissionsEditor } from '../components/common'
import { useAppStore, useAuthStore, useRbacStore } from '../store'
import { compareByName, translitPhio } from '../utils'
import { useConfirm } from '../composables/useConfirm'
import type { DtoAdminUserResponse, DtoCreateUserRequest, DtoUpdateUserRequest } from '@/api'
import type { PermissionOverride } from '../components/common/UserPermissionsEditor/types'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const auth = useAuthStore()
const rbac = useRbacStore()
const { adminUsers, users } = storeToRefs(app)

/**
 * Assigning a preset and per-user permissions is an admin-only business rule
 * (service + the rbac.manage gate): a non-admin holder of user_admin must
 * neither see the preset selector / permissions card nor send them in the
 * payload — the backend would reject the save. The gate mirrors rbac.manage
 * (the rbac_config virtual resource), which only admin holds via the bypass.
 * The preset is only a cold-start fallback before /permissions/me arrives — on
 * a page reload the empty matrix must not hide the editor from admin.
 */
const permsReady = computed(() => rbac.permsLoaded || rbac.myPermissions.length > 0)
const canManageUserRights = computed(() =>
  permsReady.value ? rbac.can('rbac_config', 'view') : auth.user?.preset === 'admin',
)

/**
 * Одна страница для создания (users/new) и редактирования (users/:id/edit):
 * карточка профиля + карточка «Права доступа» (админ). Режим определяется
 * роутом; страница редактирования сама загружает список пользователей
 * (работает на прямом URL/перезагрузке) и показывает ошибку, если id
 * отсутствует или неизвестен.
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
  preset: 'worker',
  managerId: '', // '' — нет руководителя
  position: '',
  hireDate: '',
  terminationDate: '',
})
/** Логин редактировался вручную — автозаполнение из ФИО выключается */
const loginTouched = ref(false)

/** Ошибка загрузки/редактирования: пользователь не найден (см. missing);
 *  ошибки сохранения показывает глобальный тост (http.ts). */
const error = ref<string | null>(null)
const busy = ref(false)
/** Режим редактирования: список пользователей грузится перед показом формы */
const loadingEdit = ref(isEdit.value && adminUsers.value.length === 0)
/** Режим редактирования: пользователь не найден (плохой id/нет прав/ошибка) */
const missing = ref(false)
/** manager_id пользователя при загрузке — для определения изменения при сохранении */
const savedManagerId = ref<number | null>(null)
/** Username of the edited user at load (null in create mode). */
const savedLogin = ref<string | null>(null)
/** true после первой попытки отправки — включает сообщение валидации */
const submitAttempted = ref(false)

/** Первое поле, фокус при входе для немедленного ввода с клавиатуры */
const lastNameInput = ref<HTMLInputElement | null>(null)

// Живой дефолтный логин (только создание): транслит ФИО, обновляется при вводе
watch(
  () => [form.lastName, form.firstName, form.middleName] as const,
  () => {
    if (loginTouched.value || isEdit.value) return
    form.login = translitPhio(form.lastName, form.firstName, form.middleName)
  },
)

const PRESET_LABELS: Record<string, string> = {
  admin: 'Администратор',
  dp: 'Директор проектов',
  rp: 'Руководитель проекта',
  vp: 'Владелец процесса',
  worker: 'Работник',
}

const STATIC_PRESET_OPTIONS = Object.entries(PRESET_LABELS).map(([value, label]) => ({ value, label }))

/** Пресеты из /rbac/presets; запасной вариант — статический список. */
const presetOptions = computed(() =>
  rbac.presets.length
    ? rbac.presets.map((p) => ({ value: p.name ?? '', label: PRESET_LABELS[p.name ?? ''] ?? p.name ?? '' }))
    : STATIC_PRESET_OPTIONS,
)

/** Руководители: пользователи с пресетом не «worker» + «Без руководителя» */
const managerOptions = computed(() => [
  { value: '', label: 'Без руководителя' },
  ...users.value
    .filter((u) => u.id != null && u.preset !== 'worker')
    .sort(compareByName)
    .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
])

function fillForm(u: DtoAdminUserResponse) {
  form.lastName = u.last_name ?? ''
  form.firstName = u.first_name ?? ''
  form.middleName = u.middle_name ?? ''
  form.login = u.username ?? ''
  form.preset = u.preset ?? 'worker'
  form.managerId = u.manager_id != null ? String(u.manager_id) : ''
  form.position = u.position ?? ''
  form.hireDate = u.hire_date ?? ''
  form.terminationDate = u.termination_date ?? ''
  savedManagerId.value = u.manager_id ?? null
  // Current login at load — the reserved-name exception: an unchanged reserved
  // login (e.g. the seeded "admin") stays editable; assigning/renaming to a
  // reserved word is still blocked (mirrors the backend).
  savedLogin.value = u.username ? u.username.toLowerCase() : null
  // В редактировании логин вводится вручную — без автозаполнения
  loginTouched.value = true
}

// === Индивидуальные права (admin) ===
/** Staged-переопределения (полный набор; черновик при создании уходит в
 *  payload, при редактировании — на отдельную страницу /edit/access). */
const permissionOverrides = ref<PermissionOverride[]>([])
/** Профиль успешно сохранён (показывается у кнопки «Сохранить» слева) */
const profileSaved = ref(false)

/** Сброс «Сохранено» после повторного редактирования профиля */
watch(
  () =>
    [
      form.lastName,
      form.firstName,
      form.middleName,
      form.login,
      form.preset,
      form.managerId,
      form.position,
      form.hireDate,
      form.terminationDate,
    ] as const,
  () => {
    profileSaved.value = false
  },
)

onMounted(async () => {
  void rbac.ensurePresets()
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

/** Strict login rule (mirrors the backend): always a username — only a–z/0–9/./
 * underscores, 3..20 chars, lowercase. Email logins are not supported. */
const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._]{2,19}$/
const RESERVED_LOGINS = new Set(['admin', 'support', 'root', 'system', 'help'])

function loginError(login: string, required: boolean): string | null {
  const v = login.trim().toLowerCase()
  if (v === '') return required ? 'Заполните логин' : null
  // Reserved words may not be assigned or renamed to; an unchanged reserved
  // login of the edited user (e.g. the seeded "admin") keeps working.
  if (RESERVED_LOGINS.has(v) && v !== savedLogin.value) {
    return `Логин «${v}» зарезервирован системой`
  }
  if (!LOGIN_PATTERN.test(v)) {
    return 'Только латиница, цифры, точка и подчёркивание. Длина от 3 до 20 символов'
  }
  return null
}

const loginErrorMsg = computed(() => loginError(form.login, isEdit.value))

// Live normalization: logins are stored lowercase (no User/user duplicates).
watch(
  () => form.login,
  (v) => {
    if (v !== v.toLowerCase()) form.login = v.toLowerCase()
  },
)

const canSubmit = computed(() => {
  if (busy.value) return false
  if (form.lastName.trim() === '' || form.firstName.trim() === '') return false
  // A login is always a username: blocked while empty/invalid in edit mode and
  // while invalid-but-non-empty in create mode (empty — autogenerated).
  if (loginErrorMsg.value != null) return false
  return true
})

/** Подсказка после попытки отправки с невалидной формой */
const validationMessage = computed(() => {
  if (!submitAttempted.value || canSubmit.value) return null
  if (form.lastName.trim() === '' || form.firstName.trim() === '') {
    return 'Заполните обязательные поля: Фамилия, Имя'
  }
  return null
})

/** Сгенерированный пароль показывается один раз; закрытие — назад к списку */
const passwordModal = ref<{ password: string; caption: string } | null>(null)

function onPasswordClose() {
  passwordModal.value = null
  void router.push('/users')
}

// === Сброс пароля (только редактирование, admin-only — как редактор прав) ===
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()
const resetBusy = ref(false)
/** Generated password shown once after a reset (edit mode; stays on the page) */
const resetPasswordModal = ref<{ password: string; caption: string } | null>(null)

/** Display name of the edited user (from the form — the list may not contain them on a direct URL) */
const editedUserName = computed(() => {
  const fromList = adminUsers.value.find((x) => x.id === editingUserId.value)?.name
  if (fromList) return fromList
  return [form.lastName, form.firstName].filter(Boolean).join(' ').trim() || 'пользователь'
})

function askResetPassword() {
  ask('Сбросить пароль? Новый пароль будет показан один раз после сброса.', () => {
    void onResetPassword()
  }, 'Сбросить')
}

async function onResetPassword() {
  const id = editingUserId.value
  if (id == null) return
  resetBusy.value = true
  try {
    const password = await app.resetPassword(id)
    // The generated password comes back from the backend once — show it.
    if (password) {
      resetPasswordModal.value = {
        password,
        caption: `Пароль для «${editedUserName.value}» сброшен`,
      }
    }
    // A failed reset is reported by the global toast (http.ts) — no inline banner.
  } finally {
    resetBusy.value = false
  }
}

async function onSubmit() {
  if (!canSubmit.value) {
    submitAttempted.value = true
    return
  }
  busy.value = true
  try {
    const common = {
      last_name: form.lastName.trim(),
      first_name: form.firstName.trim(),
    } as const
    if (isEdit.value) {
      const id = editingUserId.value
      if (id == null) return
      // Пустые строки очищают поля (в отличие от undefined, оставляющего значение)
      const patch: DtoUpdateUserRequest = {
        ...common,
        middle_name: form.middleName.trim(),
        username: form.login.trim(),
        position: form.position.trim(),
      }
      // Смена пресета — admin-only (сервис); не-админ не отправляет пресет вовсе
      if (canManageUserRights.value) patch.preset = form.preset
      if (form.hireDate) patch.hire_date = form.hireDate
      if (form.terminationDate) patch.termination_date = form.terminationDate
      const ok = await app.updateUser(id, patch)
      const nextManager = form.managerId === '' ? null : Number(form.managerId)
      // A failed save is reported by the global toast (http.ts); the page
      // stays open with the entered values for a retry.
      if (ok && nextManager !== savedManagerId.value) await app.updateManager(id, nextManager)
      if (!ok) return
      // Сохранение профиля НЕ закрывает страницу (права доступа — на отдельной
      // странице /edit/access); при повторном сохранении менеджер считается
      // «сохранённым».
      savedManagerId.value = nextManager
      profileSaved.value = true
      return
    }
    const payload: DtoCreateUserRequest = {
      ...common,
      middle_name: form.middleName.trim() || undefined,
      // Не-админ с user_admin.create может создавать только workers.
      preset: canManageUserRights.value ? form.preset : 'worker',
      position: form.position.trim(),
    }
    // Переопределения черновика создаются вместе с пользователем (admin-only,
    // бэкенд валидирует как /rbac/users/{id}/permissions).
    if (canManageUserRights.value && permissionOverrides.value.length) {
      payload.permissions = permissionOverrides.value.map((o) => ({
        resource: o.resource,
        action: o.action,
        scope: o.scope ?? '',
        granted: o.granted,
      }))
    }
    const login = form.login.trim()
    // Логин отправляется только если введён; пустой — генерируется на бэкенде
    // (транслит фамилии, уникальность — числовой суффикс).
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
    }
    // A failed creation is reported by the global toast (http.ts); the form
    // stays on the page for a retry.
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="ufp" :class="{ 'is-edit': isEdit }">
    <div class="ufp-head" :class="{ 'is-edit': isEdit }">
      <h2 class="ufp-title">{{ isEdit ? 'Редактировать пользователя' : 'Создать пользователя' }}</h2>
      <HintButton hint="user-form" />
      <!-- Вариант 3: переход к правам — кнопкой в шапке (прав на странице нет) -->
      <button
        v-if="isEdit"
        type="button"
        class="ufp-head-access"
        :disabled="!canManageUserRights"
        :title="canManageUserRights ? 'Индивидуальные права доступа' : 'Изменение прав доступно только администратору'"
        @click="router.push(`/users/${editingUserId}/edit/access`)"
      >
        ⚙ Изменить права
      </button>
    </div>

    <!-- Редактирование: список грузится — заглушка вместо пустой формы -->
    <p v-if="loadingEdit" class="ufp-st">Загрузка...</p>

    <!-- Редактирование: пользователь не найден — ошибка вместо формы -->
    <div v-else-if="missing" class="ufp-st">
      <p class="ufp-error">{{ error || 'Пользователь не найден' }}</p>
    </div>

    <div v-else :class="isEdit ? 'ufp-edit-wrap' : 'ufp-layout'">
      <!-- Карточка профиля: в редактировании — одна широкая карточка,
           в создании — левая колонка (закреплённая) -->
      <section :class="isEdit ? 'ufp-card-wrap' : 'ufp-aside'">
        <div class="ufp-card">
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
            <input v-model="form.middleName" type="text" class="ufp-input" autocomplete="off" placeholder="необязательно" />
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
            <span v-if="loginErrorMsg" class="ufp-hint er" role="alert">{{ loginErrorMsg }}</span>
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
          <div class="ufp-field">
            <span class="ufp-label">Даты</span>
            <div class="ufp-row">
              <input v-model="form.hireDate" type="date" class="ufp-input" aria-label="Дата приёма" />
              <input v-model="form.terminationDate" type="date" class="ufp-input" aria-label="Дата увольнения" />
            </div>
          </div>

          <!-- Mutation failures are surfaced by the global toast (http.ts);
               inline errors here are only the load/not-found message above. -->
          <p v-if="validationMessage" class="ufp-error" role="alert">{{ validationMessage }}</p>

          <div class="ufp-actions">
            <button type="button" class="ufp-btn" @click="router.push('/users')">Назад</button>
            <button
              v-if="isEdit && canManageUserRights"
              type="button"
              class="ufp-btn ufp-reset"
              :disabled="resetBusy"
              :title="'Сбросить пароль пользователя'"
              @click="askResetPassword"
            >
              {{ resetBusy ? 'Сброс…' : 'Сбросить пароль' }}
            </button>
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
          <p v-if="profileSaved" class="ufp-ok" role="status">Сохранено</p>
        </div>
      </section>

      <!-- Правая колонка (только создание): черновик прав (admin only,
           переопределения уходят в payload создания) -->
      <main v-if="!isEdit" class="ufp-main">
        <div v-if="canManageUserRights" class="ufp-perms">
          <!-- Черновик прав при создании: переключатель пресета живёт в шапке
               редактора, переопределения уходят в payload создания. -->
          <UserPermissionsEditor
            mode="draft"
            :preset="form.preset"
            :preset-options="presetOptions"
            :user-id="0"
            @update:preset="form.preset = $event"
            @update:overrides="permissionOverrides = $event"
          />
        </div>
      </main>
    </div>

    <PasswordDialog
      :open="passwordModal !== null"
      :password="passwordModal?.password ?? ''"
      :caption="passwordModal?.caption ?? ''"
      @close="onPasswordClose"
    />

    <!-- Reset-password confirmation (edit mode, admin) -->
    <ConfirmDialog
      :open="!!confirmDialog"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      @confirm="proceed"
      @close="cancel"
    />

    <!-- Generated password shown once (after a reset in the user editor) -->
    <PasswordDialog
      :open="resetPasswordModal !== null"
      :password="resetPasswordModal?.password ?? ''"
      :caption="resetPasswordModal?.caption ?? ''"
      @close="resetPasswordModal = null"
    />
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.ufp {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
}
.ufp-head {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.ufp-title {
  font-size: calc(var(--ui-font-scale, 1) * 24px);
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
}
/* Две колонки одинаковой ширины, центрированы */
.ufp-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.ufp-aside {
  position: sticky;
  top: 16px;
  min-width: 0;
}
.ufp-main {
  min-width: 0;
}
@media (max-width: 860px) {
  .ufp-layout {
    grid-template-columns: 1fr;
  }
  .ufp-aside {
    position: static;
  }
}
/* Редактирование: вся страница (шапка + карточка профиля) — один
   центрированный блок; заголовок слева, кнопка прав в строке шапки */
.ufp.is-edit {
  max-width: 720px;
}
.ufp-head.is-edit {
  align-items: center;
}
.ufp-head.is-edit .ufp-head-access {
  margin-left: auto;
}
.ufp-edit-wrap {
  min-width: 0;
}
.ufp-card-wrap {
  min-width: 0;
}
.ufp-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ufp-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.ufp-perms {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ufp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.ufp-label {
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  color: var(--ui-text-2);
  font-weight: 500;
}
.ufp-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 9px 12px;
  font-size: calc(var(--ui-font-scale, 1) * 14px);
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
  font-size: calc(var(--ui-font-scale, 1) * 12px);
  color: var(--ui-text-muted);
}
.ufp-hint.er {
  color: var(--ui-danger);
  font-weight: 500;
}
.ufp-error {
  margin: 0;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  color: var(--ui-danger);
}
.ufp-ok {
  margin: 0;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 600;
  color: var(--ui-success, #22c55e);
}
/* Кнопка перехода к правам в шапке страницы — сразу после заголовка,
   а не у дальнего края широкой колонки */
.ufp-head-access {
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  padding: 8px 16px;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 600;
  color: var(--ui-accent);
  cursor: pointer;
  white-space: nowrap;
}
.ufp-head-access:hover:not(:disabled) {
  background: var(--ui-accent-soft);
}
.ufp-head-access:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ufp-st {
  color: var(--ui-text-2);
  font-size: calc(var(--ui-font-scale, 1) * 14px);
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
  font-size: calc(var(--ui-font-scale, 1) * 14px);
  color: var(--ui-accent);
  cursor: pointer;
  white-space: nowrap;
}
.ufp-btn:hover {
  background: var(--ui-accent-soft);
}
/* Reset-password action: secondary button with the danger tint */
.ufp-reset {
  border-color: color-mix(in srgb, var(--ui-danger) 35%, transparent);
  color: var(--ui-danger);
}
.ufp-reset:hover:not(:disabled) {
  background: var(--ui-danger-soft);
}
.ufp-add {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px 18px;
  font-size: calc(var(--ui-font-scale, 1) * 14px);
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