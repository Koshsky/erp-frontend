<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { PasswordDialog, UserPermissionsEditor } from '../components/common'
import { useAppStore, useAuthStore, useRbacStore } from '../store'
import { compareByName, translitPhio } from '../utils'
import type { DtoAdminUserResponse, DtoCreateUserRequest, DtoUpdateUserRequest } from '@/api'
import type { PermissionOverride } from '../components/common/UserPermissionsEditor/types'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const auth = useAuthStore()
const rbac = useRbacStore()
const { adminUsers, adminUsersError, users } = storeToRefs(app)

/**
 * Назначение пресета и индивидуальные права — admin-only бизнес-правила
 * (сервис + гейт rbac.manage): не-админ с правом user_admin не видит ни
 * селекта пресета, ни карточки прав, и никогда не отправляет их в Payload —
 * иначе бэкенд отклонит сохранение.
 */
const isAdmin = computed(() => auth.user?.preset === 'admin')

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

/** Ошибка последней отправки (для пользователя) */
const error = ref<string | null>(null)
const busy = ref(false)
/** Режим редактирования: список пользователей грузится перед показом формы */
const loadingEdit = ref(isEdit.value && adminUsers.value.length === 0)
/** Режим редактирования: пользователь не найден (плохой id/нет прав/ошибка) */
const missing = ref(false)
/** manager_id пользователя при загрузке — для определения изменения при сохранении */
const savedManagerId = ref<number | null>(null)
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
  // В редактировании логин вводится вручную — без автозаполнения
  loginTouched.value = true
}

// === Индивидуальные права (admin) ===
/** Staged-переопределения (полный набор) */
const permissionOverrides = ref<PermissionOverride[]>([])
/** Есть ли несохранённые изменения прав */
const permissionDirty = ref(false)
/** Ошибка сохранения прав (показывается у карточки прав) */
const permissionError = ref<string | null>(null)

async function savePermissions(): Promise<boolean> {
  const id = editingUserId.value
  if (id == null) return false
  permissionError.value = null
  const ok = await rbac.saveUserPermissions(id, permissionOverrides.value)
  if (!ok) {
    permissionError.value = rbac.userPermissionsError ?? 'Не удалось сохранить права'
    return false
  }
  permissionDirty.value = false
  return true
}

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
  if (RESERVED_LOGINS.has(v)) return `Логин «${v}» зарезервирован системой`
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
      // Пустые строки очищают поля (в отличие от undefined, оставляющего значение)
      const patch: DtoUpdateUserRequest = {
        ...common,
        middle_name: form.middleName.trim(),
        username: form.login.trim(),
        position: form.position.trim(),
      }
      // Смена пресета — admin-only (сервис); не-админ не отправляет пресет вовсе
      if (isAdmin.value) patch.preset = form.preset
      if (form.hireDate) patch.hire_date = form.hireDate
      if (form.terminationDate) patch.termination_date = form.terminationDate
      const ok = await app.updateUser(id, patch)
      const nextManager = form.managerId === '' ? null : Number(form.managerId)
      if (ok && nextManager !== savedManagerId.value) await app.updateManager(id, nextManager)
      // Индивидуальные права сохраняются отдельно (admin-only редактор)
      let permsOk = true
      if (ok && isAdmin.value && permissionDirty.value) permsOk = await savePermissions()
      if (ok && permsOk) {
        void router.push('/users')
      } else {
        error.value = permsOk ? adminUsersError.value : permissionError.value
      }
      return
    }
    const payload: DtoCreateUserRequest = {
      ...common,
      middle_name: form.middleName.trim() || undefined,
      // Не-админ с user_admin.create может создавать только workers.
      preset: isAdmin.value ? form.preset : 'worker',
      position: form.position.trim(),
    }
    // Переопределения черновика создаются вместе с пользователем (admin-only,
    // бэкенд валидирует как /rbac/users/{id}/permissions).
    if (isAdmin.value && permissionOverrides.value.length) {
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
      <h2 class="ufp-title">{{ isEdit ? 'Редактировать пользователя' : 'Создать пользователя' }}</h2>
    </div>

    <!-- Редактирование: список грузится — заглушка вместо пустой формы -->
    <p v-if="loadingEdit" class="ufp-st">Загрузка...</p>

    <!-- Редактирование: пользователь не найден — ошибка вместо формы -->
    <div v-else-if="missing" class="ufp-st">
      <p class="ufp-error">{{ error || 'Пользователь не найден' }}</p>
    </div>

    <div v-else class="ufp-layout">
      <!-- Левая колонка: профиль в один столбик, закреплён на экране при
           прокрутке длинной правой колонки прав -->
      <aside class="ufp-aside">
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
            <span v-if="!isEdit && !loginTouched" class="ufp-hint">Заполняется автоматически по ФИО (транслит); можно изменить</span>
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
      </aside>

      <!-- Правая колонка: права пользователя (admin only; гейт rbac.manage на
           бэкенде). Общая страница для создания и редактирования: draft-режим
           строится из выбранного пресета и отдаёт переопределения в payload. -->
      <main class="ufp-main">
        <div v-if="isAdmin" class="ufp-perms">
          <!-- Переключатель пресета живёт в шапке карточки прав (см.
               UserPermissionsEditor): смена пресета сразу перестраивает
               базис правил ниже и отправляется вместе с профилем. -->
          <UserPermissionsEditor
            v-if="isEdit"
            mode="user"
            :user-id="editingUserId ?? 0"
            :preset="form.preset"
            :preset-options="presetOptions"
            @update:preset="form.preset = $event"
            @update:overrides="permissionOverrides = $event"
            @update:dirty="permissionDirty = $event"
          />
          <UserPermissionsEditor
            v-else
            mode="draft"
            :preset="form.preset"
            :preset-options="presetOptions"
            :user-id="0"
            @update:preset="form.preset = $event"
            @update:overrides="permissionOverrides = $event"
            @update:dirty="permissionDirty = $event"
          />
          <p v-if="permissionError" class="ufp-error" role="alert">{{ permissionError }}</p>
        </div>
      </main>
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
  font-size: 24px;
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
.ufp-hint.er {
  color: var(--ui-danger);
  font-weight: 500;
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