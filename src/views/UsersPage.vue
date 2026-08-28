<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ContextMenu, CopyField } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import { useContextMenu } from '../composables/useContextMenu'
import { useAppStore, useRbacStore } from '../store'
import { compareByName, translitPhio } from '../utils'
import type { DtoAdminUserResponse, DtoCreateUserRequest, DtoUpdateUserRequest } from '@/api'

const app = useAppStore()
const rbac = useRbacStore()
const { adminUsers, adminUsersLoading, adminUsersError, users } = storeToRefs(app)

type ColumnKey = 'name' | 'username' | 'created_at' | 'role' | 'manager'

/** Table columns: header labels, per-column filters and sortable keys */
const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'name', label: 'ФИО' },
  { key: 'username', label: 'Логин' },
  { key: 'created_at', label: 'Регистрация' },
  { key: 'role', label: 'Роль' },
  { key: 'manager', label: 'Руководитель' },
]

/** Per-column filters, rendered under the table header */
const fName = ref('')
const fLogin = ref('')
const fManager = ref('')
const fRole = ref('') // '' — all roles
const fRegDate = ref('') // yyyy-mm-dd

/** Active sort: column key + direction (1 asc, -1 desc); default ФИО ↑ */
const sortBy = ref<{ key: ColumnKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })

function toggleSort(key: ColumnKey) {
  if (sortBy.value.key === key) {
    sortBy.value = { key, dir: sortBy.value.dir === 1 ? -1 : 1 }
  } else {
    sortBy.value = { key, dir: 1 }
  }
}

/** Alphanumeric-aware string comparison: "worker_2" sorts before "worker_10" */
function cmp(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** Sort-key value of a user for a column; dates compare fine as ISO strings */
function sortValue(u: DtoAdminUserResponse, key: ColumnKey): string {
  switch (key) {
    case 'name': return u.name ?? ''
    case 'username': return u.username ?? ''
    case 'created_at': return u.created_at ?? ''
    case 'role': return roleLabel(u.role)
    case 'manager': return managerLabel(u)
  }
}

const filteredUsers = computed(() => {
  const qName = fName.value.trim().toLowerCase()
  const qLogin = fLogin.value.trim().toLowerCase()
  const qManager = fManager.value.trim().toLowerCase()
  const list = adminUsers.value.filter((u) => {
    if (qName && !(u.name ?? '').toLowerCase().includes(qName)) return false
    if (qLogin && !(u.username ?? '').toLowerCase().includes(qLogin)) return false
    if (qManager && !managerLabel(u).toLowerCase().includes(qManager)) return false
    if (fRole.value && u.role !== fRole.value) return false
    if (fRegDate.value && (u.created_at ?? '').slice(0, 10) !== fRegDate.value) return false
    return true
  })
  const { key, dir } = sortBy.value
  return list.sort((a, b) => dir * cmp(sortValue(a, key), sortValue(b, key)))
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

function roleLabel(role?: string): string {
  return role ? (ROLE_LABELS[role] ?? role) : '—'
}

// === Create / edit user dialog ===
const dialogOpen = ref(false)
const dialogBusy = ref(false)
const dialogError = ref<string | null>(null)
/** The user being edited; null — the dialog creates a new user */
const editingUser = ref<DtoAdminUserResponse | null>(null)

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

// Live default login (create mode only): translit of the full name, updated as ФИО is typed
watch(
  () => [form.lastName, form.firstName, form.middleName] as const,
  () => {
    if (loginTouched.value || editingUser.value) return
    form.login = translitPhio(form.lastName, form.firstName, form.middleName)
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

function resetForm() {
  form.lastName = ''
  form.firstName = ''
  form.middleName = ''
  form.login = ''
  form.role = 'worker'
  form.managerId = ''
  form.position = ''
  form.hireDate = ''
  form.terminationDate = ''
  loginTouched.value = false
}

function openCreate() {
  dialogError.value = null
  editingUser.value = null
  resetForm()
  dialogOpen.value = true
}

function openEdit(u: DtoAdminUserResponse) {
  dialogError.value = null
  editingUser.value = u
  form.lastName = u.last_name ?? ''
  form.firstName = u.first_name ?? ''
  form.middleName = u.middle_name ?? ''
  form.login = u.username ?? ''
  form.role = u.role ?? 'worker'
  form.managerId = u.manager_id != null ? String(u.manager_id) : ''
  form.position = u.position ?? ''
  form.hireDate = u.hire_date ?? ''
  form.terminationDate = u.termination_date ?? ''
  // In edit mode the login is entered manually — no auto-fill
  loginTouched.value = true
  dialogOpen.value = true
}

const canSubmit = computed(() => {
  if (dialogBusy.value) return false
  if (form.lastName.trim() === '' || form.firstName.trim() === '') return false
  if (editingUser.value && form.login.trim() === '') return false
  return true
})

async function onSubmit() {
  if (!canSubmit.value) return
  dialogBusy.value = true
  dialogError.value = null
  try {
    const common = {
      last_name: form.lastName.trim(),
      first_name: form.firstName.trim(),
      role: form.role,
    }
    if (editingUser.value) {
      const id = editingUser.value.id
      if (id == null) return
      // Empty strings clear the field (unlike undefined, which would keep it)
      const patch: DtoUpdateUserRequest = {
        ...common,
        middle_name: form.middleName.trim(),
        username: form.login.trim(),
        position: form.position.trim(),
      }
      if (form.hireDate) patch.hire_date = form.hireDate
      if (form.terminationDate) patch.termination_date = form.terminationDate
      const ok = await app.updateUser(id, patch)
      const prevManager = editingUser.value.manager_id ?? null
      const nextManager = form.managerId === '' ? null : Number(form.managerId)
      if (ok && nextManager !== prevManager) await app.updateManager(id, nextManager)
      if (ok) {
        dialogOpen.value = false
        editingUser.value = null
      } else {
        dialogError.value = adminUsersError.value
      }
      return
    }
    const payload: DtoCreateUserRequest = {
      ...common,
      middle_name: form.middleName.trim() || undefined,
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
      dialogOpen.value = false
      showPassword(res.password, `Пользователь «${res.user.name}» создан`)
    } else {
      dialogError.value = adminUsersError.value
    }
  } finally {
    dialogBusy.value = false
  }
}

// === Row actions (context menu) ===
interface RowMenuState {
  x: number
  y: number
  userId: number
}
const menu = ref<RowMenuState | null>(null)

const menuItems = computed<ContextMenuItem[]>(() => [
  { id: 'edit-user', label: 'Редактировать' },
  { id: 'reset-password', label: 'Сбросить пароль' },
])

function onRowContextMenu(e: MouseEvent, u: DtoAdminUserResponse) {
  if (u.id == null) return
  openMenu({ x: e.clientX, y: e.clientY, userId: u.id })
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function handleSelect(id: string) {
  if (!menu.value) return
  const u = adminUsers.value.find((x) => x.id === menu.value?.userId)
  if (!u) return
  if (id === 'edit-user') openEdit(u)
  else if (id === 'reset-password') onResetPassword(u)
}

// === Manager (for the label; editing is in the user dialog) ===
function managerLabel(user: DtoAdminUserResponse): string {
  if (user.manager_id == null) return '—'
  return users.value.find((u) => u.id === user.manager_id)?.name ?? `#${user.manager_id}`
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

// === Changing the role (fast, inline) ===
const roleChanging = ref(false)
async function onChangeRole(user: DtoAdminUserResponse, event: Event) {
  const role = (event.target as HTMLSelectElement).value
  if (user.id == null || role === user.role) return
  roleChanging.value = true
  await app.updateUser(user.id, { role })
  roleChanging.value = false
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
        <button type="button" class="up-add" @click="openCreate">Создать пользователя</button>
      </div>
    </div>

    <p v-if="adminUsersLoading && !adminUsers.length" class="up-st">Загрузка...</p>
    <p v-if="adminUsersError && !adminUsers.length" class="up-st er">{{ adminUsersError }}</p>

    <div v-if="filteredUsers.length" class="table">
      <div class="tr th th-sort">
        <button
          v-for="col in COLUMNS"
          :key="col.key"
          type="button"
          class="th-cell"
          :class="{ 'th-active': sortBy.key === col.key }"
          :title="`Сортировать по «${col.label}»`"
          @click="toggleSort(col.key)"
        >
          {{ col.label }}
          <span v-if="sortBy.key === col.key" class="th-arrow">{{ sortBy.dir === 1 ? '▲' : '▼' }}</span>
        </button>
      </div>
      <div class="tr th th-filters">
        <input v-model="fName" type="search" class="th-filter" placeholder="по ФИО" />
        <input v-model="fLogin" type="search" class="th-filter" placeholder="по логину" />
        <input v-model="fRegDate" type="date" class="th-filter" :title="'Фильтр по дате регистрации'" />
        <select v-model="fRole" class="th-filter" :title="'Фильтр по роли'">
          <option value="">Все роли</option>
          <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <input v-model="fManager" type="search" class="th-filter" placeholder="по руководителю" />
      </div>
      <div
        v-for="u in filteredUsers"
        :key="u.id"
        class="tr"
        @contextmenu.prevent.stop="onRowContextMenu($event, u)"
      >
        <div class="name">{{ u.name }}</div>
        <div class="mono">{{ u.username }}</div>
        <div>{{ fmtDate(u.created_at) }}</div>
        <div>
          <select class="up-role" :value="u.role" :disabled="roleChanging" @change="onChangeRole(u, $event)">
            <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div>{{ managerLabel(u) }}</div>
      </div>
    </div>
    <p v-else-if="!adminUsersLoading && !adminUsersError" class="up-st">
      {{ adminUsers.length ? 'Ничего не найдено' : 'Нет данных' }}
    </p>

    <ContextMenu v-bind="menuBind" @select="select" @close="closeMenu" />

    <!-- Create / edit user dialog -->
    <div v-if="dialogOpen" class="pw-overlay" @click.self="dialogOpen = false">
      <div class="pw-card uc-card" role="dialog" aria-modal="true" :aria-label="editingUser ? 'Редактировать пользователя' : 'Создать пользователя'">
        <div class="pw-caption">{{ editingUser ? 'Редактировать пользователя' : 'Создать пользователя' }}</div>

        <label class="uc-field">
          <span class="uc-label">Фамилия *</span>
          <input v-model="form.lastName" type="text" class="uc-input" autocomplete="off" />
        </label>
        <label class="uc-field">
          <span class="uc-label">Имя *</span>
          <input v-model="form.firstName" type="text" class="uc-input" autocomplete="off" />
        </label>
        <label class="uc-field">
          <span class="uc-label">Отчество</span>
          <input v-model="form.middleName" type="text" class="uc-input" autocomplete="off" />
        </label>
        <label class="uc-field">
          <span class="uc-label">Логин{{ editingUser ? ' *' : '' }}</span>
          <input
            v-model="form.login"
            type="text"
            class="uc-input"
            autocomplete="off"
            placeholder="Автозаполняется из ФИО"
            @input="loginTouched = true"
          />
          <span v-if="!editingUser && !loginTouched" class="uc-hint">Заполняется автоматически по ФИО (транслит); можно изменить</span>
        </label>
        <label class="uc-field">
          <span class="uc-label">Роль *</span>
          <select v-model="form.role" class="uc-input uc-select">
            <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label class="uc-field">
          <span class="uc-label">Руководитель</span>
          <select v-model="form.managerId" class="uc-input uc-select">
            <option v-for="opt in managerOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label class="uc-field">
          <span class="uc-label">Должность</span>
          <input v-model="form.position" type="text" class="uc-input" placeholder="Свободный текст, например «Ведущий инженер»" />
        </label>
        <div class="uc-row">
          <label class="uc-field">
            <span class="uc-label">Дата приёма</span>
            <input v-model="form.hireDate" type="date" class="uc-input" />
          </label>
          <label class="uc-field">
            <span class="uc-label">Дата увольнения</span>
            <input v-model="form.terminationDate" type="date" class="uc-input" />
          </label>
        </div>

        <p v-if="dialogError" class="uc-error">{{ dialogError }}</p>
        <p v-if="!editingUser" class="uc-note">Пароль генерируется автоматически и будет показан один раз.</p>

        <div class="uc-actions">
          <button type="button" class="up-btn" @click="dialogOpen = false">Отмена</button>
          <button type="button" class="up-add" :disabled="!canSubmit" @click="onSubmit">
            {{
              dialogBusy
                ? editingUser
                  ? 'Сохранение…'
                  : 'Создание…'
                : editingUser
                  ? 'Сохранить'
                  : 'Создать'
            }}
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
  white-space: nowrap;
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
  grid-template-columns: 1.3fr 1fr 110px 1fr 1fr;
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
.th-sort {
  padding-top: 6px;
  padding-bottom: 6px;
}
.th-cell {
  border: none;
  background: transparent;
  font: inherit;
  font-weight: 600;
  color: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  user-select: none;
}
.th-cell:hover {
  color: #1a73e8;
}
.th-active {
  color: #1a3a6b;
}
.th-arrow {
  font-size: 10px;
  line-height: 1;
}
.th-filters {
  background: #fafbfc;
  padding-top: 6px;
  padding-bottom: 6px;
}
.th-filter {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
}
.th-filter:focus {
  border-color: #1a73e8;
}
.name {
  font-weight: 700;
  color: #1a3a6b;
}

/* Overlays sit above the app header (z 30000), like the other modals */
.pw-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 40000;
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