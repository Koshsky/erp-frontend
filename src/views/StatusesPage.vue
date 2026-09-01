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

// The page is available to vp/admin only (route + guard); the buttons follow
// the exact backend rights: create/update/delete are separate state.* rules.
const { canCreateState, canManageState, canDeleteState } = useRoleAccess()

// Right-click on a row: edit/delete
interface MenuState {
  x: number
  y: number
  stateId: number
}
const menu = ref<MenuState | null>(null)
const menuItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = []
  if (canManageState.value) items.push({ id: 'edit-state', label: 'Редактировать' })
  if (canDeleteState.value) items.push({ id: 'delete-state', label: 'Удалить статус' })
  return items
})

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
  if (st.id == null || (!canManageState.value && !canDeleteState.value)) return
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
      <button v-if="canCreateState" type="button" class="sp-add" @click="openCreate">Создать статус</button>
    </div>

    <p v-if="loading && !states.length" class="sp-st">Загрузка...</p>
    <p v-if="error && !states.length" class="sp-st er">{{ error }}</p>

    <!--
      The table frame (header included) stays visible even when there is no
      data: the empty-state message is rendered inside the table instead of
      replacing it.
    -->
    <div v-if="states.length || (!loading && !error)" class="table">
      <div class="tr th">
        <div>Код</div>
        <div>Название</div>
        <div>Доступность</div>
      </div>
      <template v-if="states.length">
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
      </template>
      <p v-else class="sp-st">Нет данных о статусах</p>
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
  color: var(--ui-text);
}
.sp-add {
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
.sp-add:hover {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}
.sp-st {
  color: var(--ui-text-muted);
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: var(--ui-danger); }

.table {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: 140px 1fr 160px;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--ui-border);
  font-size: 14px;
}
.tr:last-child { border-bottom: none; }
.tr:not(.th):hover {
  background: var(--ui-surface-2);
}
.th {
  background: var(--ui-surface-2);
  font-weight: 600;
  color: var(--ui-text-muted);
}
.code {
  font-weight: 700;
  color: var(--ui-accent);
}
.avail {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--ui-success-soft);
  color: var(--ui-success);
  font-size: 13px;
  font-weight: 600;
}
.avail.off {
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
}
</style>
