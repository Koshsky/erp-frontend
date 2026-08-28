<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ContextMenu, ModalForm, ConfirmDialog } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ModalField } from '../components/common/ModalForm'
import { useConfirm } from '../composables/useConfirm'
import { useContextMenu } from '../composables/useContextMenu'
import { useEditModal } from '../composables/useEditModal'
import { useRoleAccess } from '../composables/useRoleAccess'
import { useTimesheetStore } from '../store'
import type { DtoStateResponse } from '@/api'

const ts = useTimesheetStore()
const { states, loading, error } = storeToRefs(ts)

// The page is available to vp/admin only (route + guard); the buttons follow the same rule.
const { canManageStates } = useRoleAccess()

// Right-click on a row: edit/delete
interface MenuState {
  x: number
  y: number
  stateId: number
}
const menu = ref<MenuState | null>(null)
const menuItems = computed<ContextMenuItem[]>(() => [
  { id: 'edit-state', label: 'Редактировать' },
  { id: 'delete-state', label: 'Удалить статус' },
])

// Delete confirmation dialog
const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

type ModalMode =
  | { type: 'create' }
  | { type: 'edit'; id: number; code: string; name: string; isAvailable: boolean }

/** Status availability (ModalField does not support boolean — we use '1'/'0') */
const availabilityOptions: ModalField['options'] = [
  { value: '1', label: 'Доступен' },
  { value: '0', label: 'Недоступен' },
]

const { open: openModal, close: closeModal, submit: submitModal, bind: modalBind } = useEditModal<ModalMode>(
  (state) => [
    { key: 'code', label: 'Код', type: 'text', value: state.type === 'edit' ? state.code : '', required: true },
    { key: 'name', label: 'Название', type: 'text', value: state.type === 'edit' ? state.name : '', required: true },
    {
      key: 'isAvailable',
      label: 'Доступность',
      type: 'select',
      options: availabilityOptions,
      value: state.type === 'edit' ? (state.isAvailable ? '1' : '0') : '1',
    },
  ],
  async (state, values) => {
    const payload = {
      code: String(values.code ?? '').trim(),
      name: String(values.name ?? '').trim(),
      is_available: values.isAvailable === '1',
    }
    const ok =
      state.type === 'create'
        ? await ts.createState(payload)
        : await ts.updateState(state.id, payload)
    return { ok, error: ok ? null : error.value }
  },
  (state) => (state.type === 'create' ? 'Создать статус' : 'Редактировать статус'),
  (state) => (state.type === 'create' ? 'Создать' : 'Сохранить'),
)

function onRowContextMenu(e: MouseEvent, st: DtoStateResponse) {
  if (st.id == null || !canManageStates.value) return
  openMenu({ x: e.clientX, y: e.clientY, stateId: st.id })
}

const { open: openMenu, close: closeMenu, select, bind: menuBind } = useContextMenu(menu, menuItems, handleSelect)

function openCreate() {
  openModal({ type: 'create' })
}

function openEdit(id: number) {
  const st = states.value.find((s) => s.id === id)
  if (st) {
    openModal({
      type: 'edit',
      id,
      code: st.code ?? '',
      name: st.name ?? '',
      isAvailable: st.is_available ?? true,
    })
  }
}

function handleSelect(id: string) {
  if (!menu.value) return
  if (id === 'edit-state') {
    openEdit(menu.value.stateId)
  } else if (id === 'delete-state') {
    const stateId = menu.value.stateId
    ask('Удалить статус?', () => {
      void ts.deleteState(stateId)
    })
  }
}

onMounted(() => {
  if (!states.value.length) ts.loadStates()
})
</script>

<template>
  <section class="sp">
    <div class="sp-head">
      <h2 class="sp-title">Статусы</h2>
      <button v-if="canManageStates" type="button" class="sp-add" @click="openCreate">Создать статус</button>
    </div>

    <p v-if="loading && !states.length" class="sp-st">Загрузка...</p>
    <p v-if="error && !states.length" class="sp-st er">{{ error }}</p>

    <div v-if="states.length" class="table">
      <div class="tr th">
        <div>Код</div>
        <div>Название</div>
        <div>Доступность</div>
      </div>
      <div
        v-for="st in states"
        :key="st.id"
        class="tr"
        @contextmenu.prevent.stop="onRowContextMenu($event, st)"
      >
        <div class="code">{{ st.code }}</div>
        <div>{{ st.name }}</div>
        <div>
          <span class="avail" :class="{ off: !st.is_available }">
            {{ st.is_available ? 'Доступен' : 'Недоступен' }}
          </span>
        </div>
      </div>
    </div>
    <p v-else-if="!loading && !error" class="sp-st">Нет данных о статусах</p>

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
.sp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.sp-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
}
.sp-add {
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
.sp-add:hover {
  background: #1765cc;
}
.sp-st {
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
  grid-template-columns: 140px 1fr 160px;
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
.avail {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  background: #e6f4ea;
  color: #137333;
  font-size: 13px;
  font-weight: 600;
}
.avail.off {
  background: #fce8e6;
  color: #c5221f;
}
</style>
