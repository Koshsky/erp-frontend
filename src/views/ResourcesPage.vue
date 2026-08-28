<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useAppStore, useTimesheetStore, useAuthStore } from '../store'
import { compareByName } from '../utils'
import type { DtoResourceMemberResponse, DtoResourceResponse } from '@/api'

const store = useAppStore()
const { resources, resourcesLoading, resourcesError, users } = storeToRefs(store)
const ts = useTimesheetStore()
const { employees } = storeToRefs(ts)
const auth = useAuthStore()

// dp (project director) — read-only: can change only project priorities,
// so creating/editing/deleting resources is not available to them.
const { canManageResources, role, userId } = useRoleAccess()
const isAdmin = computed(() => role.value === 'admin')

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
const menuItems = computed<ContextMenuItem[]>(() => [
  { id: 'edit-resource', label: 'Редактировать' },
  { id: 'delete-resource', label: 'Удалить ресурс' },
])

// Delete confirmation dialog (instead of window.confirm — it is blocked in iframes/sandboxes)
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

type ModalMode =
  | { type: 'create' }
  | { type: 'edit'; id: number; code: string; title: string; ownerId?: number }

/** Owner options (users, excluding workers) */
const ownerOptions = computed<ModalField['options']>(() =>
  users.value
    .filter((u) => u.id != null && u.role !== 'worker')
    .sort(compareByName)
    .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
)

/** Filter by owner (owner_id): admin picks the owner, the backend filters by scope */
const ownerFilter = ref<number | ''>('')
const filteredResources = computed(() => resources.value)

// Changing the owner filter reloads the listing with owner_id (admin only)
watch(ownerFilter, (v) => {
  if (isAdmin.value) store.loadResources(typeof v === 'number' ? v : undefined)
})

const { open: openModal, close: closeModal, submit: submitModal, bind: modalBind } = useEditModal<ModalMode>(
  (state) => {
    const fields: ModalField[] = [
      { key: 'code', label: 'Код', type: 'text', value: state.type === 'create' ? '' : state.code, required: true },
      { key: 'title', label: 'Название', type: 'text', value: state.type === 'create' ? '' : state.title },
    ]
    // The owner is chosen by admin only (owner_id is required); vp creates resources in their own ownership
    if (isAdmin.value) {
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
    const payload: { code: string; title: string; owner_id?: number } = {
      code: String(values.code ?? '').trim(),
      title: String(values.title ?? '').trim(),
    }
    if (isAdmin.value && values.ownerId != null) {
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
  if (res.id == null || !canManageResources.value) return
  openMenu({ x: e.clientX, y: e.clientY, resourceId: res.id })
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openCreate() {
  openModal({ type: 'create' })
}

function openEdit(id: number) {
  const res = resources.value.find((r) => r.id === id)
  if (res) {
    openModal({ type: 'edit', id, code: res.code ?? '', title: res.title ?? '', ownerId: res.owner_id ?? undefined })
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
const expandedId = ref<number | null>(null)
const addMemberId = ref<number | ''>('')

function membersFor(id: number): DtoResourceMemberResponse[] {
  return [...(store.resourceMembers[id] ?? [])].sort(compareByName)
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

async function toggleExpanded(res: DtoResourceResponse) {
  if (res.id == null) return
  if (expandedId.value === res.id) {
    expandedId.value = null
    return
  }
  expandedId.value = res.id
  if (!membersFor(res.id).length) await store.loadResourceMembers(res.id)
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
  if (isAdmin.value && !users.value.length) store.loadUsers()
  if (!employees.value.length) void ts.fetchEmployees()
})
</script>

<template>
  <section class="rp">
    <div class="rp-head">
      <h2 class="rp-title">Ресурсы</h2>
      <div class="rp-actions">
        <select v-if="isAdmin" v-model="ownerFilter" class="rp-filter">
          <option value="">Все владельцы</option>
          <option v-for="u in users.filter((u) => u.role !== 'worker').sort(compareByName)" :key="u.id" :value="u.id">{{ u.name ?? `#${u.id}` }}</option>
        </select>
        <button v-if="canManageResources" type="button" class="rp-add" @click="openCreate">Создать ресурс</button>
      </div>
    </div>

    <p v-if="resourcesLoading" class="rp-st">Загрузка...</p>
    <p v-if="resourcesError" class="rp-st er">{{ resourcesError }}</p>

    <div v-if="filteredResources.length" class="table">
      <div class="tr th">
        <div>Код</div>
        <div>Название</div>
        <div>Сотрудников</div>
        <div>Владелец</div>
      </div>
      <template v-for="res in filteredResources" :key="res.id">
        <div
          class="tr rp-row"
          :class="{ 'rp-open': expandedId === res.id }"
          @click="toggleExpanded(res)"
          @contextmenu.prevent.stop="onRowContextMenu($event, res)"
        >
          <div class="code">{{ res.code }}</div>
          <div>{{ res.title }}</div>
          <div>{{ res.employees_count }}</div>
          <div>{{ ownerLabel(res.owner_id) }}</div>
        </div>
        <div v-if="expandedId === res.id" class="rp-members">
          <div class="rp-members-head">
            <span class="rp-members-title">Пользователи ({{ membersFor(res.id ?? 0).length }})</span>
            <div class="rp-members-add">
              <select v-model="addMemberId" class="rp-filter">
                <option value="">Добавить пользователя...</option>
                <option v-for="w in workersNotIn(res.id ?? 0)" :key="w.id" :value="w.id">
                  {{ w.name }}
                </option>
              </select>
              <button
                type="button"
                class="rp-member-btn"
                :disabled="!addMemberId"
                @click="onAddMember(res.id ?? 0)"
              >
                Добавить
              </button>
            </div>
          </div>
          <div v-if="membersFor(res.id ?? 0).length" class="rp-members-list">
            <div v-for="m in membersFor(res.id ?? 0)" :key="m.id" class="rp-member">
              <span class="rp-member-name">{{ m.name }}</span>
              <span class="rp-member-pos">{{ m.position || '—' }}</span>
              <button
                type="button"
                class="rp-member-btn rp-member-remove"
                @click="onRemoveMember(res.id ?? 0, m.id ?? 0)"
              >
                Убрать
              </button>
            </div>
          </div>
          <p v-else class="rp-members-empty">Нет участников</p>
        </div>
      </template>
    </div>
    <p v-else-if="!resourcesLoading && !resourcesError && resources.length" class="rp-st">Ничего не найдено</p>
    <p v-else-if="!resourcesLoading && !resourcesError" class="rp-st">Нет данных о ресурсах</p>

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
.rp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.rp-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
}
.rp-add {
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
.rp-add:hover {
  background: #1765cc;
}
.rp-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rp-filter {
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rp-filter:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.rp-st {
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: #d93025; }

.table {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: 120px 1fr 120px 1fr;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}
.tr:last-child { border-bottom: none; }
.tr:not(.th):hover {
  background: #f6f8fa;
}
.rp-row {
  cursor: pointer;
}
.rp-open {
  background: #f6f8fa;
}
.rp-members {
  padding: 12px 20px;
  background: #fafbfc;
  border-bottom: 1px solid #f0f0f0;
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
  color: #555;
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
  background: #fff;
  border: 1px solid #ececec;
  font-size: 13px;
}
.rp-member-name {
  font-weight: 600;
  color: #1a3a6b;
}
.rp-member-pos {
  color: #667;
}
.rp-member-btn {
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #1a73e8;
  color: #fff;
  transition: background 0.15s;
}
.rp-member-btn:hover:not(:disabled) {
  background: #1765cc;
}
.rp-member-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rp-member-remove {
  background: #fff;
  color: #b3261e;
  border: 1px solid #e0e0e0;
}
.rp-member-remove:hover:not(:disabled) {
  background: #fef2f1;
}
.rp-members-empty {
  margin: 0;
  padding: 8px 0;
  font-size: 13px;
  color: #888;
  text-align: center;
}
.th {
  background: #f8f9fa;
  font-weight: 600;
  color: #555;
}
.code {
  font-weight: 700;
  color: #1a73e8;
}
</style>
