<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ModalForm, CopyField } from '../components/common'
import type { ModalField } from '../components/common/ModalForm'
import { useAppStore, useRbacStore } from '../store'
import { compareByName } from '../utils'
import type { DtoAdminUserResponse, DtoCreateUserRequest, DtoUpdateUserRequest } from '@/api'

const app = useAppStore()
const rbac = useRbacStore()
const { adminUsers, adminUsersLoading, adminUsersError, users } = storeToRefs(app)

/** Пользователи, отсортированные по ФИО */
const sortedUsers = computed(() => [...adminUsers.value].sort(compareByName))

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  dp: 'Директор проектов',
  rp: 'Руководитель проекта',
  vp: 'Владелец процесса',
  worker: 'Работник',
}

const STATIC_ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

/** Роли из каталога /rbac/roles; fallback — статический список. */
const roleOptions = computed(() =>
  rbac.roles.length
    ? rbac.roles.map((r) => ({ value: r.name ?? '', label: ROLE_LABELS[r.name ?? ''] ?? r.name ?? '' }))
    : STATIC_ROLE_OPTIONS,
)

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function roleLabel(role?: string): string {
  return role ? (ROLE_LABELS[role] ?? role) : '—'
}

// === Создание пользователя ===
const createOpen = ref(false)
const createBusy = ref(false)
const createError = ref<string | null>(null)

const createFields = computed<ModalField[]>(() => [
  { key: 'lastName', label: 'Фамилия', type: 'text', value: '', required: true },
  { key: 'firstName', label: 'Имя', type: 'text', value: '', required: true },
  { key: 'middleName', label: 'Отчество', type: 'text', value: '' },
  { key: 'role', label: 'Роль', type: 'select', value: 'worker', options: roleOptions.value, required: true },
  { key: 'position', label: 'Должность', type: 'text', value: '', placeholder: 'Свободный текст, например «Ведущий инженер»' },
  { key: 'hireDate', label: 'Дата приёма', type: 'date', value: '' },
  { key: 'terminationDate', label: 'Дата увольнения', type: 'date', value: '' },
])

function openCreate() {
  createError.value = null
  createOpen.value = true
}

async function onCreate(values: Record<string, string | number>) {
  createBusy.value = true
  createError.value = null
  const payload: DtoCreateUserRequest = {
    last_name: String(values.lastName ?? '').trim(),
    first_name: String(values.firstName ?? '').trim(),
    middle_name: String(values.middleName ?? '').trim() || undefined,
    role: String(values.role ?? 'worker'),
    position: String(values.position ?? '').trim(),
  }
  if (values.hireDate) payload.hire_date = String(values.hireDate)
  if (values.terminationDate) payload.termination_date = String(values.terminationDate)
  const res = await app.createUser(payload)
  createBusy.value = false
  if (res && res.user) {
    createOpen.value = false
    showPassword(res.password, `Пользователь «${res.user.name}» создан`)
  } else {
    createError.value = adminUsersError.value
  }
}

// === Показ сгенерированного пароля (один раз) ===
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

// === Смена роли ===
const roleChanging = ref(false)
async function onChangeRole(user: DtoAdminUserResponse, event: Event) {
  const role = (event.target as HTMLSelectElement).value
  if (user.id == null || role === user.role) return
  roleChanging.value = true
  await app.updateUser(user.id, { role })
  roleChanging.value = false
}

// === Менеджер (для подписи; редактирование — на странице структуры) ===
function managerLabel(user: DtoAdminUserResponse): string {
  if (user.manager_id == null) return '—'
  return users.value.find((u) => u.id === user.manager_id)?.name ?? `#${user.manager_id}`
}

onMounted(() => {
  void app.loadAdminUsers(true)
  if (!users.value.length) void app.loadUsers()
  void rbac.ensureRoles()
})
</script>

<template>
  <section class="up">
    <div class="up-head">
      <h2 class="up-title">Пользователи</h2>
      <button type="button" class="up-add" @click="openCreate">Создать пользователя</button>
    </div>

    <p v-if="adminUsersLoading && !adminUsers.length" class="up-st">Загрузка...</p>
    <p v-if="adminUsersError && !adminUsers.length" class="up-st er">{{ adminUsersError }}</p>

    <div v-if="sortedUsers.length" class="table">
      <div class="tr th">
        <div>ФИО</div>
        <div>Логин</div>
        <div>Хеш пароля</div>
        <div>Роль</div>
        <div>Руководитель</div>
        <div class="act">Действия</div>
      </div>
      <div v-for="u in sortedUsers" :key="u.id" class="tr">
        <div class="name">{{ u.name }}</div>
        <div class="mono">{{ u.username }}</div>
        <div class="mono hash" :title="u.password_hash">{{ u.password_hash || '—' }}</div>
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
    <p v-else-if="!adminUsersLoading && !adminUsersError" class="up-st">Нет данных</p>

    <ModalForm
      :open="createOpen"
      :title="'Создать пользователя'"
      :fields="createFields"
      :busy="createBusy"
      :error="createError"
      @save="onCreate"
      @close="createOpen = false"
    />

    <!-- Показ сгенерированного пароля -->
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
}
.up-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
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
  transition: background 0.15s;
}
.up-add:hover {
  background: #1765cc;
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
.hash {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1.5fr 1fr 1fr 150px;
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
</style>
