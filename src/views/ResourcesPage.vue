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
import { useAppStore } from '../store'
import type { DtoResourceResponse } from '@/api'

const store = useAppStore()
const { resources, resourcesLoading, resourcesError, users } = storeToRefs(store)

// dp (директор проектов) — read-only: может менять только приоритет проектов,
// поэтому создание/редактирование/удаление ресурсов ему недоступно.
const { canManageResources, role, userId } = useRoleAccess()
const isAdmin = computed(() => role.value === 'admin')

/** Подпись владельца ресурса: admin — имя, vp — «Я» */
function ownerLabel(ownerId?: number | null): string {
  if (ownerId == null) return '—'
  if (ownerId === userId.value) return 'Я'
  const u = users.value.find((x) => x.id === ownerId)
  return u?.name ?? `#${ownerId}`
}

// ПКМ по строке ресурса: редактирование/удаление
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

// Диалог подтверждения удаления (вместо window.confirm — блокируется в iframe/песочнице)
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

type ModalMode =
  | { type: 'create' }
  | { type: 'edit'; id: number; code: string; title: string; ownerId?: number }

/** Варианты владельцев (пользователей) */
const ownerOptions = computed<ModalField['options']>(() =>
  users.value
    .filter((u) => u.id != null)
    .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
)

/** Фильтр по владельцу (owner_id): admin выбирает владельца, бэкенд фильтрует по скоупу */
const ownerFilter = ref<number | ''>('')
const filteredResources = computed(() => resources.value)

// Смена фильтра владельца перезагружает листинг с owner_id (только для admin)
watch(ownerFilter, (v) => {
  if (isAdmin.value) store.loadResources(typeof v === 'number' ? v : undefined)
})

const { open: openModal, close: closeModal, submit: submitModal, bind: modalBind } = useEditModal<ModalMode>(
  (state) => {
    const fields: ModalField[] = [
      { key: 'code', label: 'Код', type: 'text', value: state.type === 'create' ? '' : state.code, required: true },
      { key: 'title', label: 'Название', type: 'text', value: state.type === 'create' ? '' : state.title },
    ]
    // Владельца выбирает только admin (owner_id обязателен); vp создаёт себе в собственность
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

onMounted(() => {
  if (!resources.value.length) store.loadResources()
  if (isAdmin.value && !users.value.length) store.loadUsers()
})
</script>

<template>
  <section class="rp">
    <div class="rp-head">
      <h2 class="rp-title">Ресурсы</h2>
      <div class="rp-actions">
        <select v-if="isAdmin" v-model="ownerFilter" class="rp-filter">
          <option value="">Все владельцы</option>
          <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name ?? `#${u.id}` }}</option>
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
      <div
        v-for="res in filteredResources"
        :key="res.id"
        class="tr"
        @contextmenu.prevent.stop="onRowContextMenu($event, res)"
      >
        <div class="code">{{ res.code }}</div>
        <div>{{ res.title }}</div>
        <div>{{ res.employees_count }}</div>
        <div>{{ ownerLabel(res.owner_id) }}</div>
      </div>
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
