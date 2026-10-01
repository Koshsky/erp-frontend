<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ContextMenu, ModalForm, ConfirmDialog, PendingMark, DataTable } from '../components/common'
import type { DataTableColumn } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useAppStore, useTimesheetStore, useAuthStore, useRbacStore } from '../store'
import { compareByName } from '../utils'
import { useColumnWidths } from '../composables/useColumnWidths'
import { isOffline } from '../offline/state'
import { scheduleNamedRefresh } from '../offline/sync'
import type { DtoResourceMemberResponse, DtoResourceResponse } from '@/api'

const store = useAppStore()
const { resources, resourcesLoading, resourcesError, users } = storeToRefs(store)
const ts = useTimesheetStore()
const { employees } = storeToRefs(ts)
const auth = useAuthStore()

/**
 * The DataTable cell slot gives the row as `unknown` (generic inference does
 * not reach through the store's refs) — cast to the page's row type here.
 */
const asRes = (row: unknown): DtoResourceResponse => row as DtoResourceResponse

/** Table columns; sorting is handled inside DataTable. */
const columns: DataTableColumn[] = [
  { key: 'code', label: 'Код', width: '120px' },
  { key: 'title', label: 'Название', width: 'fit-content(460px)' },
  { key: 'employees_count', label: 'Сотрудников', width: '120px' },
  { key: 'owner_id', label: 'Владелец', width: 'fit-content(300px)' },
]

/** Per-user persisted column widths (drag-resize on the header edges). */
const { columnWidths } = useColumnWidths('resources')

// dp (project director) — read-only: can change only project priorities,
// so creating/editing/deleting resources is not available to them.
const { canCreateResource, canManageResource, canDeleteResource, role, userId } = useRoleAccess()

const rbac = useRbacStore()
/** Permissions arrived (or were cached) — the matrix is authoritative; the preset is the cold-start fallback. */
const permsReady = computed(() => rbac.permsLoaded || rbac.myPermissions.length > 0)
/** The "Все владельцы" filter — for an unrestricted resource list (resource.view scope all). */
const seesAllResources = computed(() =>
  permsReady.value ? rbac.perm('resource', 'view') === 'all' : role.value === 'admin',
)
/** Picking the resource owner — the create/update right with scope all. */
function canSetOwner(mode: 'create' | 'edit'): boolean {
  if (permsReady.value) return rbac.perm('resource', mode === 'create' ? 'create' : 'update') === 'all'
  return role.value === 'admin'
}

/** Resource owner label: admin — name, vp — "Me" */
function ownerLabel(ownerId?: number | null): string {
  if (ownerId == null) return '—'
  if (ownerId === userId.value) return 'Я'
  const u = users.value.find((x) => x.id === ownerId)
  return u?.name ?? `#${ownerId}`
}

// Right-click on a resource row: edit/delete
interface MenuState {
  x: number
  y: number
  resourceId: number
}
const menu = ref<MenuState | null>(null)
const menuItems = computed<ContextMenuItem[]>(() => {
  const res = resources.value.find((r) => r.id === menu.value?.resourceId)
  if (!res) return []
  const items: ContextMenuItem[] = []
  if (canManageResource(res.owner_id)) items.push({ id: 'edit-resource', label: 'Редактировать' })
  if (canDeleteResource(res.owner_id)) items.push({ id: 'delete-resource', label: 'Удалить ресурс' })
  return items
})

// Delete confirmation dialog (instead of window.confirm — it is blocked in iframes/sandboxes)
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

type ModalMode =
  | { type: 'create' }
  | { type: 'edit'; id: number; code: string; title: string; ownerId?: number; color?: string }

/** Owner options (users, excluding workers) */
const ownerOptions = computed<ModalField['options']>(() =>
  users.value
    .filter((u) => u.id != null && u.preset !== 'worker')
    .sort(compareByName)
    .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
)

/** Filter by owner (owner_id) — client-side: rendering always reads local data */
const ownerFilter = ref<number | ''>('')
const filteredResources = computed(() => {
  const list = resources.value
  return typeof ownerFilter.value === 'number'
    ? list.filter((r) => (r as { owner_id?: number | null }).owner_id === ownerFilter.value)
    : list
})

const { open: openModal, close: closeModal, submit: submitModal, bind: modalBind } = useEditModal<ModalMode>(
  (state) => {
    const fields: ModalField[] = [
      { key: 'code', label: 'Код', type: 'text', value: state.type === 'create' ? '' : state.code, required: true },
      { key: 'title', label: 'Название', type: 'text', value: state.type === 'create' ? '' : state.title },
      {
        key: 'color',
        label: 'Цвет',
        type: 'color',
        value: state.type === 'create' ? '' : (state.color ?? ''),
      },
    ]
    // The owner is chosen with the all scope only (owner_id); vp creates resources in their own ownership
    if (canSetOwner(state.type)) {
      fields.push({
        key: 'ownerId',
        label: 'Владелец',
        type: 'select',
        options: ownerOptions.value,
        value: state.type === 'create' ? (userId.value ?? undefined) : (state.ownerId ?? undefined),
      })
    }
    return fields
  },
  async (state, values) => {
    const payload: { code: string; title: string; color?: string; owner_id?: number } = {
      code: String(values.code ?? '').trim(),
      title: String(values.title ?? '').trim(),
    }
    // '' means "no custom color" → the backend stores NULL (standard color)
    payload.color = String(values.color ?? '')
    if (canSetOwner(state.type) && values.ownerId != null) {
      payload.owner_id = Number(values.ownerId)
    }
    const ok =
      state.type === 'create'
        ? await store.createResource(payload)
        : await store.updateResource(state.id, payload)
    return { ok, error: ok ? null : store.resourcesError }
  },
  (state) => (state.type === 'create' ? 'Создать ресурс' : 'Редактировать ресурс'),
  (state) => (state.type === 'create' ? 'Создать' : 'Сохранить'),
)

function onRowContextMenu(e: MouseEvent, res: DtoResourceResponse) {
  if (res.id == null) return
  const ownerId = res.owner_id
  if (!canManageResource(ownerId) && !canDeleteResource(ownerId)) return
  openMenu({ x: e.clientX, y: e.clientY, resourceId: res.id })
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openCreate() {
  openModal({ type: 'create' })
}

function openEdit(id: number) {
  const res = resources.value.find((r) => r.id === id)
  if (res) {
    openModal({ type: 'edit', id, code: res.code ?? '', title: res.title ?? '', ownerId: res.owner_id ?? undefined, color: res.color ?? '' })
  }
}

function handleSelect(id: string) {
  if (!menu.value) return
  if (id === 'edit-resource') {
    openEdit(menu.value.resourceId)
  } else if (id === 'delete-resource') {
    const resourceId = menu.value.resourceId
    ask('Удалить ресурс?', () => {
      void store.deleteResource(resourceId)
    })
  }
}

// === Resource member (user) management ===
const addMemberId = ref<number | ''>('')

function membersFor(id: number): DtoResourceMemberResponse[] {
  return [...(store.resourceMembers[id] ?? [])].sort(compareByName)
}

/**
 * Expand toggling itself lives inside DataTable (row click); this hook only
 * hydrates the member list before the first render of the detail.
 */
async function ensureMembers(res: DtoResourceResponse) {
  if (res.id == null || membersFor(res.id).length) return
  await store.loadResourceMembers(res.id)
}

/** Workers and the current user not yet in the resource (candidates for adding) */
function workersNotIn(id: number) {
  const ids = new Set(membersFor(id).map((m) => m.id))
  const candidates: Array<{ id: number; name: string }> = employees.value
    .filter((w) => w.id != null && !ids.has(w.id))
    .map((w) => ({ id: w.id as number, name: w.name ?? `#${w.id}` }))
  const me = auth.user
  // The owner (vp) can add themselves to their own resource (e.g. the installation service manager resource)
  if (me?.id != null && !ids.has(me.id)) {
    candidates.push({ id: me.id, name: me.name ?? 'Я' })
  }
  return candidates.sort(compareByName)
}

async function onAddMember(resourceId: number) {
  if (!addMemberId.value) return
  await store.addResourceMember(resourceId, addMemberId.value)
  addMemberId.value = ''
}

async function onRemoveMember(resourceId: number, userId: number) {
  await store.removeResourceMember(resourceId, userId)
}

onMounted(() => {
  if (!resources.value.length) store.loadResources()
  // The user catalog feeds the owner select/filter options — load it only when
  // those controls can appear (a scope-all resource right or the owner filter).
  const needsCatalog = seesAllResources.value || canSetOwner('create') || canSetOwner('edit')
  if (!users.value.length && needsCatalog) store.loadUsers()
  if (!employees.value.length) void ts.loadEmployees()
  // Page-entry SWR (as on the Employees page): local-first render, then re-read
  // the resource list from the network while online — covers a cold start with
  // an empty cache and the background sync disabled.
  if (!isOffline.value) void scheduleNamedRefresh(['resources'])
})

/** "Load more": appends the next resources page (dedup by id) */
function onLoadMore() {
  void store.loadMoreResources()
}
</script>

<template>
  <section class="rp">
    <p v-if="resourcesLoading" class="rp-st">Загрузка...</p>
    <p v-if="resourcesError" class="rp-st er">{{ resourcesError }}</p>

    <!--
      The table frame (header included) stays visible even when the filters
      leave no rows: the empty-state message is rendered inside the table
      instead of replacing it, so the header and filter controls remain usable.
    -->
    <DataTable
      v-if="resources.length || (!resourcesLoading && !resourcesError)"
      :columns="columns"
      :rows="filteredResources"
      title="Ресурсы"
      expandable
      resizable
      v-model:column-widths="columnWidths"
      :empty-text="resources.length ? 'Ничего не найдено' : 'Нет данных о ресурсах'"
      @row-click="(_e, row) => void ensureMembers(asRes(row))"
      @row-contextmenu="(e, row) => onRowContextMenu(e, asRes(row))"
    >
      <template #actions>
        <select v-if="seesAllResources" v-model="ownerFilter" class="rp-filter">
          <option value="">Все владельцы</option>
          <option v-for="u in users.filter((u) => u.preset !== 'worker').sort(compareByName)" :key="u.id" :value="u.id">{{ u.name ?? `#${u.id}` }}</option>
        </select>
        <button v-if="canCreateResource" type="button" class="rp-add" @click="openCreate">Создать ресурс</button>
      </template>
      <template #cell="{ row, column }">
        <span v-if="column.key === 'code'" class="code">
          {{ asRes(row).code }}
          <PendingMark entity="resource" :id="asRes(row).id" />
        </span>
        <template v-else-if="column.key === 'title'">{{ asRes(row).title }}</template>
        <template v-else-if="column.key === 'employees_count'">{{ asRes(row).employees_count }}</template>
        <template v-else>{{ ownerLabel(asRes(row).owner_id) }}</template>
      </template>
      <template #expanded="{ row }">
        <div class="rp-members">
          <div class="rp-members-head">
            <span class="rp-members-title">Пользователи ({{ membersFor(asRes(row).id ?? 0).length }})</span>
            <div v-if="canManageResource(asRes(row).owner_id)" class="rp-members-add">
              <select v-model="addMemberId" class="rp-filter">
                <option value="">Добавить пользователя...</option>
                <option v-for="w in workersNotIn(asRes(row).id ?? 0)" :key="w.id" :value="w.id">
                  {{ w.name }}
                </option>
              </select>
              <button
                type="button"
                class="rp-member-btn"
                :disabled="!addMemberId"
                @click="onAddMember(asRes(row).id ?? 0)"
              >
                Добавить
              </button>
            </div>
          </div>
          <div v-if="membersFor(asRes(row).id ?? 0).length" class="rp-members-list">
            <div v-for="m in membersFor(asRes(row).id ?? 0)" :key="m.id" class="rp-member">
              <span class="rp-member-name">{{ m.name }}</span>
              <span class="rp-member-pos">{{ m.position || '—' }}</span>
              <button
                v-if="canManageResource(asRes(row).owner_id)"
                type="button"
                class="rp-member-btn rp-member-remove"
                @click="onRemoveMember(asRes(row).id ?? 0, m.id ?? 0)"
              >
                Убрать
              </button>
            </div>
          </div>
          <p v-else class="rp-members-empty">Нет участников</p>
        </div>
      </template>
    </DataTable>

    <!-- Resources pagination: the backend returns PAGE_SIZE (50) rows plus a total -->
    <div v-if="store.resourcesHasMore" class="rp-more">
      <button type="button" class="rp-more-btn" :disabled="store.resourcesLoadingMore" @click="onLoadMore">
        {{ store.resourcesLoadingMore ? 'Загрузка…' : `Показать ещё (${resources.length} из ${store.resourcesTotal})` }}
      </button>
    </div>

    <ContextMenu v-bind="menuBind" @select="select" @close="closeMenu" />

    <ConfirmDialog
      :open="!!confirmDialog"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      @confirm="proceed"
      @close="cancel"
    />

    <ModalForm v-bind="modalBind" @save="submitModal" @close="closeModal" />
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

/* Toolbar controls (rendered inside the DataTable actions slot) */
.rp-add {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  transition: background var(--ui-duration);
}
.rp-add:hover {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
/* "Load more" footer: resources are paged server-side (PAGE_SIZE per request) */
.rp-more {
  display: flex;
  justify-content: center;
  padding: 16px 0 4px;
}
.rp-more-btn {
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  background: var(--ui-surface);
  color: var(--ui-text-2);
  transition: background var(--ui-duration), border-color var(--ui-duration), color var(--ui-duration);
}
.rp-more-btn:hover:not(:disabled) {
  background: var(--ui-surface-2);
  border-color: var(--ui-accent);
  color: var(--ui-text);
}
.rp-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.rp-filter {
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
.rp-filter:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
/* Loading / error placeholders outside the table */
.rp-st {
  color: var(--ui-text-muted);
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: var(--ui-danger); }

/* Expanded member block (DataTable #expanded slot) */
.rp-members {
  padding: 12px 20px;
  background: var(--ui-surface-2);
}
.rp-members-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.rp-members-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-2);
}
.rp-members-add {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rp-members-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rp-member {
  display: grid;
  grid-template-columns: 1fr 1.4fr 80px;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  font-size: 13px;
}
.rp-member-name {
  font-weight: 600;
  color: var(--ui-accent);
}
.rp-member-pos {
  color: var(--ui-text-muted);
}
.rp-member-btn {
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  transition: background var(--ui-duration);
}
.rp-member-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.rp-member-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rp-member-remove {
  background: var(--ui-surface);
  color: var(--ui-danger);
  border: 1px solid var(--ui-border);
}
.rp-member-remove:hover:not(:disabled) {
  background: var(--ui-danger-soft);
}
.rp-members-empty {
  margin: 0;
  padding: 8px 0;
  font-size: 13px;
  color: var(--ui-text-muted);
  text-align: center;
}
/* Resource code cell */
.code {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: var(--ui-accent);
}
</style>
