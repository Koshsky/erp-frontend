<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { HintButton, ContextMenu, ConfirmDialog, DataTable } from '../components/common'
import type { DataTableColumn } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useAppStore, useRbacStore } from '../store'
import { useColumnWidths } from '../composables/useColumnWidths'
import type { DtoAdminUserResponse } from '@/api'

const router = useRouter()
const app = useAppStore()
const rbac = useRbacStore()
const { adminUsers, adminUsersLoading, adminUsersError } = storeToRefs(app)

/**
 * The DataTable cell slot gives the row as `unknown` (generic inference does
 * not reach through the store's refs) — cast to the page's row type here.
 */
const asUser = (row: unknown): DtoAdminUserResponse => row as DtoAdminUserResponse

/** Table columns: sortable keys; sorting itself lives inside DataTable. */
const columns: DataTableColumn[] = [
  { key: 'name', label: 'ФИО', width: 'fit-content(380px)' },
  { key: 'username', label: 'Логин', width: 'fit-content(280px)' },
  { key: 'preset', label: 'Пресет', width: 'fit-content(260px)' },
]

/** Russian preset labels for the column (unknown values fall back to the raw code). */
const PRESET_LABELS: Record<string, string> = {
  admin: 'Администратор',
  dp: 'Директор проектов',
  rp: 'Руководитель проекта',
  vp: 'Владелец процесса',
  worker: 'Работник',
}

function presetLabel(preset?: string): string {
  return preset ? (PRESET_LABELS[preset] ?? preset) : '—'
}

/** Per-column filters, rendered as the DataTable filter row */
const fName = ref('')
const fLogin = ref('')

/** Client-side filtering (sorting is delegated to DataTable) */
const filteredUsers = computed(() => {
  const qName = fName.value.trim().toLowerCase()
  const qLogin = fLogin.value.trim().toLowerCase()
  return adminUsers.value.filter((u) => {
    if (qName && !(u.name ?? '').toLowerCase().includes(qName)) return false
    if (qLogin && !(u.username ?? '').toLowerCase().includes(qLogin)) return false
    return true
  })
})

const emptyText = computed(() => (adminUsers.value.length ? 'Ничего не найдено' : 'Нет данных'))

/** Per-user persisted column widths (drag-resize on the header edges). */
const { columnWidths } = useColumnWidths('users')

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
  } else if (id === 'delete-user') askDelete(u)
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
    const ok = await app.deleteUser(id)
    if (ok) {
      await refreshAfterMutation()
    }
    // Failed deletions (e.g. blocked by referencing records) are surfaced by
    // the global error notification (http.ts interceptor) — no local banner.
  })
}

/** Row click → the user's edit page (users/:id/edit); requires the user.edit right */
function goToEdit(u: DtoAdminUserResponse) {
  if (u.id == null || !rbac.can('user_admin', 'update')) return
  void router.push(`/users/${u.id}/edit`)
}

onMounted(() => {
  void app.loadAdminUsers()
})

/**
 * Server-side search over the whole user base (not only over the loaded page):
 * the list is capped at 500 rows, so users beyond the cap would otherwise be
 * unreachable. Debounced (~300 ms) and always restarts from the first page.
 */
const search = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    void app.refreshAdminUsers(search.value.trim())
  }, 300)
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

/** Refreshes the list keeping the active search after a mutation (delete) */
async function refreshAfterMutation() {
  await app.refreshAdminUsers(search.value.trim())
}
</script>

<template>
  <section class="up">
    <p v-if="adminUsersLoading && !adminUsers.length" class="up-st">Загрузка...</p>
    <p v-if="adminUsersError && !adminUsers.length" class="up-st er">{{ adminUsersError }}</p>

    <!--
      The table frame (header and the filter row) stays visible even when the
      filters leave no rows: the empty-state message is rendered inside the
      table instead of replacing it, so the filters remain editable.
    -->
    <DataTable
      v-if="adminUsers.length || (!adminUsersLoading && !adminUsersError)"
      :columns="columns"
      :rows="filteredUsers"
      title="Пользователи"
      :empty-text="emptyText"
      resizable
      v-model:column-widths="columnWidths"
      @row-click="(_e, row) => goToEdit(asUser(row))"
      @row-contextmenu="(e, row) => onRowContextMenu(e, asUser(row))"
    >
      <template #actions>
        <HintButton hint="users" />
        <input v-model="search" type="search" class="up-search" placeholder="Поиск по ФИО или логину" />
        <button v-if="rbac.can('user_admin', 'create')" type="button" class="up-add" @click="router.push('/users/new')">
          Создать пользователя
        </button>
      </template>
      <template #filters>
        <input v-model="fName" type="search" class="th-filter" placeholder="по ФИО" />
        <input v-model="fLogin" type="search" class="th-filter" placeholder="по логину" />
        <!-- No per-preset filter (display + sort only); an empty cell keeps the
             filter row aligned with the three header columns. -->
        <div></div>
      </template>
      <template #cell="{ row, column }">
        <span v-if="column.key === 'name'" class="up-name">{{ asUser(row).name }}</span>
        <span v-else-if="column.key === 'username'" class="mono">{{ asUser(row).username }}</span>
        <span v-else class="up-preset">{{ presetLabel(asUser(row).preset) }}</span>
      </template>
    </DataTable>

    <ContextMenu v-bind="menuBind" @select="select" @close="closeMenu" />

    <ConfirmDialog
      :open="!!confirmDialog"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      @confirm="proceed"
      @close="cancel"
    />
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

/* Toolbar controls (rendered inside the DataTable actions slot) */
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
.up-search {
  width: 240px;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}
.up-search:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
/* Loading / error placeholders outside the table */
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
/* Filter-row inputs (rendered inside the DataTable #filters slot) */
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
/* Cell renders */
.up-name {
  font-weight: 700;
  color: var(--ui-text);
}
.up-preset {
  color: var(--ui-text-2);
  font-size: 13px;
}
</style>