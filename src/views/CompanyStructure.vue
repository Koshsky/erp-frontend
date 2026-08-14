<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../store'
import { compareByName } from '../utils'
import type { DtoAdminUserResponse } from '@/api'

const app = useAppStore()
const { adminUsers, adminUsersLoading, adminUsersError, users } = storeToRefs(app)

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  dp: 'Директор проектов',
  rp: 'Руководитель проекта',
  vp: 'Владелец процесса',
  worker: 'Работник',
}

function roleLabel(role?: string): string {
  return role ? (ROLE_LABELS[role] ?? role) : '—'
}

interface TreeNode {
  user: DtoAdminUserResponse
  depth: number
  childrenCount: number
}

/** Пользователи, сгруппированные по руководителю (manager_id), по ФИО на каждом уровне */
const childrenOf = computed(() => {
  const map = new Map<number, DtoAdminUserResponse[]>()
  for (const u of adminUsers.value) {
    const m = u.manager_id ?? 0
    const list = map.get(m) ?? []
    list.push(u)
    map.set(m, list)
  }
  for (const list of map.values()) list.sort(compareByName)
  return map
})

/** Плоский иерархический список с отступами (обход от корней, защита от циклов) */
const tree = computed<TreeNode[]>(() => {
  const byId = new Map<number, DtoAdminUserResponse>()
  for (const u of adminUsers.value) if (u.id != null) byId.set(u.id, u)

  // Подсчёт подчинённых (включая вложенных), с защитой от циклов
  const countChildren = (id: number, seen: Set<number>): number => {
    if (seen.has(id)) return 0
    seen.add(id)
    let total = 0
    for (const child of childrenOf.value.get(id) ?? []) {
      if (child.id == null) continue
      total += 1 + countChildren(child.id, new Set(seen))
    }
    return total
  }

  const out: TreeNode[] = []
  const visited = new Set<number>()
  const visit = (id: number, depth: number, branchSeen: Set<number>) => {
    if (branchSeen.has(id) || visited.has(id)) return
    visited.add(id)
    branchSeen.add(id)
    const user = byId.get(id)
    if (user) out.push({ user, depth, childrenCount: countChildren(id, new Set()) })
    for (const child of childrenOf.value.get(id) ?? []) {
      if (child.id != null) visit(child.id, depth + 1, new Set(branchSeen))
    }
  }

  for (const root of childrenOf.value.get(0) ?? []) {
    if (root.id != null) visit(root.id, 0, new Set())
  }
  // Защитный показ: неохваченные обходом (циклы/битые данные) показываем корнями
  for (const u of adminUsers.value) {
    if (u.id != null && !visited.has(u.id)) visit(u.id, 0, new Set())
  }
  return out
})

/** Все прямые и косвенные потомки пользователя (циклоустойчиво) */
function descendantsOf(id: number): Set<number> {
  const out = new Set<number>()
  const stack = [...(childrenOf.value.get(id) ?? [])]
  while (stack.length) {
    const u = stack.pop()!
    if (u.id == null || out.has(u.id)) continue
    out.add(u.id)
    stack.push(...(childrenOf.value.get(u.id) ?? []))
  }
  return out
}

const saving = ref(false)
const saveError = ref<string | null>(null)

/** Варианты руководителя: все пользователи, кроме самого и его потомков, по ФИО */
function managerOptions(user: DtoAdminUserResponse) {
  const excluded = user.id != null ? descendantsOf(user.id) : new Set<number>()
  if (user.id != null) excluded.add(user.id)
  return [
    { value: '', label: 'Без руководителя' },
    ...adminUsers.value
      .filter((u) => u.id != null && !excluded.has(u.id))
      .sort(compareByName)
      .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
  ]
}

async function onChangeManager(user: DtoAdminUserResponse, event: Event) {
  const raw = (event.target as HTMLSelectElement).value
  if (user.id == null) return
  const managerId = raw === '' ? null : Number(raw)
  if ((managerId ?? null) === user.manager_id) return
  saving.value = true
  saveError.value = null
  const ok = await app.updateManager(user.id, managerId)
  saving.value = false
  if (!ok) saveError.value = adminUsersError.value
}

onMounted(() => {
  void app.loadAdminUsers(false)
  if (!users.value.length) void app.loadUsers()
})
</script>

<template>
  <section class="cs">
    <div class="cs-head">
      <h2 class="cs-title">Структура компании</h2>
      <p class="cs-hint">Управление иерархией: выберите руководителя для каждого сотрудника. Прямые и косвенные подчинённые учитываются при подсчёте.</p>
    </div>

    <p v-if="saveError" class="cs-st er cs-save-error">{{ saveError }}</p>
    <p v-if="adminUsersLoading && !tree.length" class="cs-st">Загрузка...</p>
    <p v-if="adminUsersError && !tree.length" class="cs-st er">{{ adminUsersError }}</p>

    <div v-if="tree.length" class="table">
      <div class="tr th">
        <div class="col-name">Сотрудник</div>
        <div>Роль</div>
        <div class="col-mgr">Руководитель</div>
        <div>Подчинённых</div>
      </div>
      <div v-for="node in tree" :key="node.user.id" class="tr">
        <div class="col-name" :style="{ paddingLeft: node.depth * 22 + 'px' }">
          <span class="depth-tick" v-if="node.depth > 0">↳</span>
          <span class="name">{{ node.user.name }}</span>
          <span class="mono">{{ node.user.username }}</span>
        </div>
        <div>{{ roleLabel(node.user.role) }}</div>
        <div class="col-mgr">
          <select
            class="cs-mgr"
            :value="node.user.manager_id ?? ''"
            :disabled="saving"
            @change="onChangeManager(node.user, $event)"
          >
            <option v-for="opt in managerOptions(node.user)" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div>{{ node.childrenCount }}</div>
      </div>
    </div>
    <p v-else-if="!adminUsersLoading && !adminUsersError" class="cs-st">Нет данных</p>
  </section>
</template>

<style scoped>
.cs-head {
  margin-bottom: 20px;
}
.cs-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 6px;
}
.cs-hint {
  margin: 0;
  font-size: 13px;
  color: #888;
}
.cs-st {
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: #d93025; }
.cs-save-error {
  background: #fef2f1;
  border: 1px solid #f3c1bd;
  border-radius: 8px;
  margin-bottom: 12px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #999;
  margin-left: 8px;
}
.table {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: 2fr 1fr 1.6fr 120px;
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
.col-name {
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
}
.name {
  font-weight: 700;
  color: #1a3a6b;
}
.depth-tick {
  color: #bbb;
  margin-right: 6px;
}
.cs-mgr {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
}
.cs-mgr:focus {
  border-color: #1a73e8;
}
</style>
