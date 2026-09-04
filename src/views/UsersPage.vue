<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { ContextMenu, ConfirmDialog, PasswordDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useAppStore, useRbacStore } from '../store'
import type { DtoAdminUserResponse } from '@/api'

const router = useRouter()
const app = useAppStore()
const rbac = useRbacStore()
const { adminUsers, adminUsersLoading, adminUsersError } = storeToRefs(app)

type ColumnKey = 'name' | 'username'

/** Table columns: header labels and sortable keys */
const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'name', label: 'ФИО' },
  { key: 'username', label: 'Логин' },
]

/** Per-column filters, rendered under the table header */
const fName = ref('')
const fLogin = ref('')

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

/** Sort-key value of a user for a column */
function sortValue(u: DtoAdminUserResponse, key: ColumnKey): string {
  switch (key) {
    case 'name': return u.name ?? ''
    case 'username': return u.username ?? ''
  }
}

const filteredUsers = computed(() => {
  const qName = fName.value.trim().toLowerCase()
  const qLogin = fLogin.value.trim().toLowerCase()
  const list = adminUsers.value.filter((u) => {
    if (qName && !(u.name ?? '').toLowerCase().includes(qName)) return false
    if (qLogin && !(u.username ?? '').toLowerCase().includes(qLogin)) return false
    return true
  })
  const { key, dir } = sortBy.value
  return list.sort((a, b) => dir * cmp(sortValue(a, key), sortValue(b, key)))
})

/**
 * Row actions (context menu), gated by the user-admin rights: editing a user
 * (who is also an employee) happens only in this admin section and only with
 * the user.edit permission.
 */
interface RowMenuState {
  x: number
  y: number
  userId: number
}
const menu = ref<RowMenuState | null>(null)

const menuItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = []
  if (rbac.can('user_admin', 'update')) {
    items.push({ id: 'edit-user', label: 'Редактировать' })
    items.push({ id: 'reset-password', label: 'Сбросить пароль' })
  }
  if (rbac.can('user_admin', 'delete')) {
    items.push({ id: 'delete-user', label: 'Удалить пользователя' })
  }
  return items
})

function onRowContextMenu(e: MouseEvent, u: DtoAdminUserResponse) {
  if (u.id == null || !menuItems.value.length) return
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
  else if (id === 'delete-user') askDelete(u)
}

// === Deleting a user (soft delete; lifecycle lives in this admin section) ===
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()
const deleteTarget = ref<string | null>(null)

function askDelete(u: DtoAdminUserResponse) {
  deleteTarget.value = u.id != null ? String(u.id) : null
  ask(`Удалить пользователя «${u.name ?? u.username ?? ''}»?`, async () => {
    const id = Number(deleteTarget.value)
    if (!Number.isFinite(id) || id <= 0) return
    deleteTarget.value = null
    await app.deleteUser(id)
  })
}

/** Row click → the user's edit page (users/:id/edit); requires the user.edit right */
function goToEdit(u: DtoAdminUserResponse) {
  if (u.id == null || !rbac.can('user_admin', 'update')) return
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

onMounted(() => {
  void app.loadAdminUsers()
})
</script>

<template>
  <section class="up">
    <div class="up-head">
      <h2 class="up-title">Пользователи</h2>
      <div class="up-actions">
        <button v-if="rbac.can('user_admin', 'create')" type="button" class="up-add" @click="router.push('/users/new')">
          Создать пользователя
        </button>
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
        </div>
      </template>
      <p v-else class="up-st">{{ adminUsers.length ? 'Ничего не найдено' : 'Нет данных' }}</p>
    </div>

    <ContextMenu v-bind="menuBind" @select="select" @close="closeMenu" />

    <ConfirmDialog
      :open="!!confirmDialog"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      @confirm="proceed"
      @close="cancel"
    />

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
  grid-template-columns: 1.3fr 1fr;
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