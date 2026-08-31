<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { ContextMenu, PasswordDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import { useContextMenu } from '../composables/useContextMenu'
import { useAppStore, useRbacStore } from '../store'
import type { DtoAdminUserResponse } from '@/api'

const router = useRouter()
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
  if (id === 'edit-user') {
    goToEdit(u)
  } else if (id === 'reset-password') onResetPassword(u)
}

/** Row click → the user's edit page (users/:id/edit) */
function goToEdit(u: DtoAdminUserResponse) {
  if (u.id == null) return
  void router.push(`/users/${u.id}/edit`)
}

/** Keyboard activation of the row (Enter/Space), ignoring keys from inner controls */
function onRowKeydown(e: KeyboardEvent, u: DtoAdminUserResponse) {
  if (e.target !== e.currentTarget) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    goToEdit(u)
  }
}

// === Manager (for the label; editing is on the user form page) ===
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
        <button type="button" class="up-add" @click="router.push('/users/new')">Создать пользователя</button>
      </div>
    </div>

    <p v-if="adminUsersLoading && !adminUsers.length" class="up-st">Загрузка...</p>
    <p v-if="adminUsersError && !adminUsers.length" class="up-st er">{{ adminUsersError }}</p>

    <!--
      The table frame (header and the filter row) stays visible even when the
      filters leave no rows: the empty-state message is rendered inside the
      table instead of replacing it, so the filters remain editable.
    -->
    <div v-if="adminUsers.length || (!adminUsersLoading && !adminUsersError)" class="table">
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
      <template v-if="filteredUsers.length">
        <div
          v-for="u in filteredUsers"
          :key="u.id"
          class="tr"
          role="link"
          tabindex="0"
          :aria-label="`Редактировать пользователя «${u.name ?? u.username ?? ''}»`"
          @click="goToEdit(u)"
          @keydown="onRowKeydown($event, u)"
          @contextmenu.prevent.stop="onRowContextMenu($event, u)"
        >
          <div class="name">{{ u.name }}</div>
          <div class="mono">{{ u.username }}</div>
          <div>{{ fmtDate(u.created_at) }}</div>
          <div>
            <select
              class="up-role"
              :value="u.role"
              :disabled="roleChanging"
              @click.stop
              @change="onChangeRole(u, $event)"
            >
              <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div>{{ managerLabel(u) }}</div>
        </div>
      </template>
      <p v-else class="up-st">{{ adminUsers.length ? 'Ничего не найдено' : 'Нет данных' }}</p>
    </div>

    <ContextMenu v-bind="menuBind" @select="select" @close="closeMenu" />

    <!-- Generated password shown once (after reset) -->
    <PasswordDialog
      :open="passwordModal !== null"
      :password="passwordModal?.password ?? ''"
      :caption="passwordModal?.caption ?? ''"
      @close="passwordModal = null"
    />
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

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
  color: var(--ui-text);
}
.up-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.up-add {
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
.up-add:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.up-add:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.up-role {
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
}
.up-role:focus {
  border-color: var(--ui-accent);
}
.up-st {
  color: var(--ui-text-2);
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: var(--ui-danger); }
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.table {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: 1.3fr 1fr 110px 1fr 1fr;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--ui-border);
  font-size: 14px;
  align-items: center;
}
.tr:last-child { border-bottom: none; }
.tr:not(.th):hover { background: var(--ui-surface-3); }
.tr:not(.th) { cursor: pointer; }
.th {
  background: var(--ui-surface-2);
  font-weight: 600;
  color: var(--ui-text-2);
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
  color: var(--ui-accent);
}
.th-active {
  color: var(--ui-text);
}
.th-arrow {
  font-size: 10px;
  line-height: 1;
}
.th-filters {
  background: var(--ui-surface-2);
  padding-top: 6px;
  padding-bottom: 6px;
}
.th-filter {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
}
.th-filter:focus {
  border-color: var(--ui-accent);
}
.name {
  font-weight: 700;
  color: var(--ui-text);
}
</style>