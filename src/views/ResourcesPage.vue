<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useAppStore } from '../store'
import type { DtoResourceResponse } from '@/api'

const store = useAppStore()
const { resources, resourcesLoading, resourcesError } = storeToRefs(store)

// dp (директор проектов) — read-only: может менять только приоритет проектов,
// поэтому создание/редактирование/удаление ресурсов ему недоступно.
const { canManage } = useRoleAccess()

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
  | { type: 'edit'; id: number; code: string; title: string }
const { open: openModal, close: closeModal, submit: submitModal, bind: modalBind } = useEditModal<ModalMode>(
  (state) => {
    const base = state.type === 'create'
      ? { code: '', title: '' }
      : { code: state.code, title: state.title }
    return [
      { key: 'code', label: 'Код', type: 'text', value: base.code, required: true },
      { key: 'title', label: 'Название', type: 'text', value: base.title },
    ]
  },
  async (state, values) => {
    const payload = {
      code: String(values.code ?? '').trim(),
      title: String(values.title ?? '').trim(),
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
  if (res.id == null || !canManage.value) return
  openMenu({ x: e.clientX, y: e.clientY, resourceId: res.id })
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openCreate() {
  openModal({ type: 'create' })
}

function openEdit(id: number) {
  const res = resources.value.find((r) => r.id === id)
  if (res) {
    openModal({ type: 'edit', id, code: res.code ?? '', title: res.title ?? '' })
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
})
</script>

<template>
  <section class="rp">
    <div class="rp-head">
      <h2 class="rp-title">Ресурсы</h2>
      <button v-if="canManage" type="button" class="rp-add" @click="openCreate">Создать ресурс</button>
    </div>

    <p v-if="resourcesLoading" class="rp-st">Загрузка...</p>
    <p v-if="resourcesError" class="rp-st er">{{ resourcesError }}</p>

    <div v-if="resources.length" class="table">
      <div class="tr th">
        <div>Код</div>
        <div>Название</div>
        <div>Сотрудников</div>
      </div>
      <div
        v-for="res in resources"
        :key="res.id"
        class="tr"
        @contextmenu.prevent.stop="onRowContextMenu($event, res)"
      >
        <div class="code">{{ res.code }}</div>
        <div>{{ res.title }}</div>
        <div>{{ res.employees_count }}</div>
      </div>
    </div>
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
  grid-template-columns: 120px 1fr 120px;
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
