<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { CopyField } from '../components/common'
import { useAppStore, useRbacStore } from '../store'
import { compareByName, translitPhio } from '../utils'
import type { DtoAdminUserResponse, DtoCreateUserRequest } from '@/api'

const app = useAppStore()
const rbac = useRbacStore()
const { adminUsers, adminUsersLoading, adminUsersError, users } = storeToRefs(app)

/** Users sorted by full name */
const sortedUsers = computed(() => [...adminUsers.value].sort(compareByName))

/** Search by full name (ФИО), case-insensitive */
const search = ref('')

/** Role filter: '' — all roles */
const roleFilter = ref('')

const filteredUsers = computed(() => {
  let list = sortedUsers.value
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter((u) => (u.name ?? '').toLowerCase().includes(q))
  if (roleFilter.value) list = list.filter((u) => u.role === roleFilter.value)
  return list
})

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

/** Date as DD.MM.YYYY (works with plain dates and RFC3339 datetimes), or «—» */
function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-')
  return `${d}.${m}.${y}`
}

// === Creating a user ===
const createOpen = ref(false)
const createBusy = ref(false)
const createError = ref<string | null>(null)

const create = reactive({
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

// Live default login: translit of the full name, updated as ФИО is typed
watch(
  () => [create.lastName, create.firstName, create.middleName] as const,
  () => {
    if (loginTouched.value) return
    create.login = translitPhio(create.lastName, create.firstName, create.middleName)
  },
)

/** Manager options: users with a non-worker role + "No manager" */
const managerOptions = computed(() => [
  { value: '', label: 'Без руководителя' },
  ...users.value
    .filter((u) => u.id != null && u.role !== 'worker')
    .sort(compareByName)
    .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
])

function openCreate() {
  createError.value = null
  create.lastName = ''
  create.firstName = ''
  create.middleName = ''
  create.login = ''
  create.role = 'worker'
  create.managerId = ''
  create.position = ''
  create.hireDate = ''
  create.terminationDate = ''
  loginTouched.value = false
  createOpen.value = true
}

const canCreate = computed(
  () => create.lastName.trim() !== '' && create.firstName.trim() !== '' && !createBusy.value,
)

async function onCreate() {
  if (!canCreate.value) return
  createBusy.value = true
  createError.value = null
  const payload: DtoCreateUserRequest = {
    last_name: create.lastName.trim(),
    first_name: create.firstName.trim(),
    middle_name: create.middleName.trim() || undefined,
    role: create.role,
    position: create.position.trim(),
  }
  const login = create.login.trim()
  // Send the login only if entered; an empty one lets the backend generate it
  // (transliteration of the last name, uniqueness ensured by a numeric suffix).
  if (login) payload.username = login
  if (create.hireDate) payload.hire_date = create.hireDate
  if (create.terminationDate) payload.termination_date = create.terminationDate
  if (create.managerId !== '') payload.manager_id = Number(create.managerId)
  const res = await app.createUser(payload)
  createBusy.value = false
  if (res && res.user) {
    createOpen.value = false
    showPassword(res.password, `Пользователь «${res.user.name}» создан`)
  } else {
    createError.value = adminUsersError.value
  }
}

// === Showing the generated password (once) ===
const passwordModal = ref<{ password: string; caption: string } | null>(null)

function showPassword(password: string | undefined, caption: string) {
  if (!password) return
  passwordModal.value = { password, caption }
}

async function onResetPassword(user: DtoAdminUserResponse) {
  if (user.id == null) return
  const password = await app.resetPassword(user.id)
  showPassword(password ?? undefined, `Новый пароль для «${user.name}»`)
}

// === Changing the role ===
const roleChanging = ref(false)
async function onChangeRole(user: DtoAdminUserResponse, event: Event) {
  const role = (event.target as HTMLSelectElement).value
  if (user.id == null || role === user.role) return
  roleChanging.value = true
  await app.updateUser(user.id, { role })
  roleChanging.value = false
}

// === Manager (for the label; editing is on the structure page) ===
function managerLabel(user: DtoAdminUserResponse): string {
  if (user.manager_id == null) return '—'
  return users.value.find((u) => u.id === user.manager_id)?.name ?? `#${user.manager_id}`
}

onMounted(() => {
  void app.loadAdminUsers()
  if (!users.value.length) void app.loadUsers()
  void rbac.ensureRoles()
})
</script>

<template>
  <section class="up">
    <div class="up-head">
      <h2 class="up-title">Пользователи</h2>
      <div class="up-actions">
        <input v-model="search" type="search" class="up-search" placeholder="Поиск по ФИО" />
        <select v-model="roleFilter" class="up-filter" title="Фильтр по роли">
          <option value="">Все роли</option>
          <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <button type="button" class="up-add" @click="openCreate">Создать пользователя</button>
      </div>
    </div>

    <p v-if="adminUsersLoading && !adminUsers.length" class="up-st">Загрузка...</p>
    <p v-if="adminUsersError && !adminUsers.length" class="up-st er">{{ adminUsersError }}</p>

    <div v-if="filteredUsers.length" class="table">
      <div class="tr th">
        <div>ФИО</div>
        <div>Логин</div>
        <div>Регистрация</div>
        <div>Роль</div>
        <div>Руководитель</div>
        <div class="act">Действия</div>
      </div>
      <div v-for="u in filteredUsers" :key="u.id" class="tr">
        <div class="name">{{ u.name }}</div>
        <div class="mono">{{ u.username }}</div>
        <div>{{ fmtDate(u.created_at) }}</div>
        <div>
          <select class="up-role" :value="u.role" :disabled="roleChanging" @change="onChangeRole(u, $event)">
            <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div>{{ managerLabel(u) }}</div>
        <div class="act">
          <button type="button" class="up-btn" @click="onResetPassword(u)">Сбросить пароль</button>
        </div>
      </div>
    </div>
    <p v-else-if="!adminUsersLoading && !adminUsersError" class="up-st">
      {{ adminUsers.length ? 'Ничего не найдено' : 'Нет данных' }}
    </p>

    <!-- Create user dialog -->
    <div v-if="createOpen" class="pw-overlay" @click.self="createOpen = false">
      <div class="pw-card uc-card" role="dialog" aria-modal="true" aria-label="Создать пользователя">
        <div class="pw-caption">Создать пользователя</div>

        <label class="uc-field">
          <span class="uc-label">Фамилия *</span>
          <input v-model="create.lastName" type="text" class="uc-input" autocomplete="off" />
        </label>
        <label class="uc-field">
          <span class="uc-label">Имя *</span>
          <input v-model="create.firstName" type="text" class="uc-input" autocomplete="off" />
        </label>
        <label class="uc-field">
          <span class="uc-label">Отчество</span>
          <input v-model="create.middleName" type="text" class="uc-input" autocomplete="off" />
        </label>
        <label class="uc-field">
          <span class="uc-label">Логин</span>
          <input
            v-model="create.login"
            type="text"
            class="uc-input"
            autocomplete="off"
            placeholder="Автозаполняется из ФИО"
            @input="loginTouched = true"
          />
          <span v-if="!loginTouched" class="uc-hint">Заполняется автоматически по ФИО (транслит); можно изменить</span>
        </label>
        <label class="uc-field">
          <span class="uc-label">Роль *</span>
          <select v-model="create.role" class="uc-input uc-select">
            <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label class="uc-field">
          <span class="uc-label">Руководитель</span>
          <select v-model="create.managerId" class="uc-input uc-select">
            <option v-for="opt in managerOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label class="uc-field">
          <span class="uc-label">Должность</span>
          <input v-model="create.position" type="text" class="uc-input" placeholder="Свободный текст, например «Ведущий инженер»" />
        </label>
        <div class="uc-row">
          <label class="uc-field">
            <span class="uc-label">Дата приёма</span>
            <input v-model="create.hireDate" type="date" class="uc-input" />
          </label>
          <label class="uc-field">
            <span class="uc-label">Дата увольнения</span>
            <input v-model="create.terminationDate" type="date" class="uc-input" />
          </label>
        </div>

        <p v-if="createError" class="uc-error">{{ createError }}</p>
        <p class="uc-note">Пароль генерируется автоматически и будет показан один раз.</p>

        <div class="uc-actions">
          <button type="button" class="up-btn" @click="createOpen = false">Отмена</button>
          <button type="button" class="up-add" :disabled="!canCreate" @click="onCreate">
            {{ createBusy ? 'Создание…' : 'Создать' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Showing the generated password -->
    <div v-if="passwordModal" class="pw-overlay" @click.self="passwordModal = null">
      <div class="pw-card">
        <div class="pw-caption">{{ passwordModal.caption }}</div>
        <CopyField :value="passwordModal.password" />
        <p class="pw-note">Пароль показывается один раз. Скопируйте его и передайте пользователю.</p>
        <button type="button" class="pw-close" @click="passwordModal = null">Закрыть</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.up-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.up-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
}
.up-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.up-search {
  width: 220px;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
}
.up-search:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.up-filter {
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
}
.up-filter:focus {
  border-color: #1a73e8;
}
.up-add {
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #1a73e8;
  color: #fff;
  transition: background 0.15s, opacity 0.15s;
}
.up-add:hover:not(:disabled) {
  background: #1765cc;
}
.up-add:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.up-role {
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
}
.up-role:focus {
  border-color: #1a73e8;
}
.up-btn {
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  padding: 6px 12px;
  font-size: 13px;
  color: #1a73e8;
  cursor: pointer;
}
.up-btn:hover {
  background: #eef4fd;
}
.up-st {
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: #d93025; }
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.table {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: 1.3fr 1fr 110px 1fr 1fr 150px;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
  align-items: center;
}
.tr:last-child { border-bottom: none; }
.tr:not(.th):hover { background: #f6f8fa; }
.th {
  background: #f8f9fa;
  font-weight: 600;
  color: #555;
}
.name {
  font-weight: 700;
  color: #1a3a6b;
}
.act { text-align: right; }

.pw-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pw-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pw-caption {
  font-size: 16px;
  font-weight: 700;
  color: #2c3e50;
}
.pw-note {
  font-size: 12px;
  color: #888;
  margin: 0;
}
.pw-close {
  border: none;
  border-radius: 8px;
  padding: 9px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #1a73e8;
  color: #fff;
}

.uc-card {
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}
.uc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.uc-label {
  font-size: 13px;
  color: #444;
  font-weight: 500;
}
.uc-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
}
.uc-input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.uc-select {
  cursor: pointer;
}
.uc-hint {
  font-size: 12px;
  color: #888;
}
.uc-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.uc-error {
  margin: 0;
  font-size: 13px;
  color: #d93025;
}
.uc-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 2px;
}
</style>