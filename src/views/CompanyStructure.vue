<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { DataTable, HintButton } from '../components/common'
import type { DataTableColumn } from '../components/common'
import { useAppStore, useRbacStore } from '../store'
import { compareByName } from '../utils'
import { useColumnWidths } from '../composables/useColumnWidths'
import { presetLabelFromCatalog } from '../utils/presets'
import type { DtoAdminUserResponse } from '@/api'

const app = useAppStore()
const rbac = useRbacStore()
const { adminUsers, adminUsersLoading, adminUsersError, users } = storeToRefs(app)
const { presets } = storeToRefs(rbac)

function presetLabel(preset?: string | null): string {
  return presetLabelFromCatalog(preset, presets.value)
}

interface TreeNode {
  user: DtoAdminUserResponse
  depth: number
  childrenCount: number
}

/** Users grouped by their manager (manager_id), sorted by full name at each level */
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

/** Flat hierarchical list with indentation (walk from the roots, cycle protection) */
const tree = computed<TreeNode[]>(() => {
  const byId = new Map<number, DtoAdminUserResponse>()
  for (const u of adminUsers.value) if (u.id != null) byId.set(u.id, u)

  // Count subordinates (including nested ones), with cycle protection
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
  // Fallback display: users not reached by the walk (cycles/broken data) are shown as roots
  for (const u of adminUsers.value) {
    if (u.id != null && !visited.has(u.id)) visit(u.id, 0, new Set())
  }
  return out
})

/**
 * The DataTable cell slot gives the row as `unknown` — cast to the page's
 * node type here.
 */
const asNode = (row: unknown): TreeNode => row as TreeNode

/** Column config; sorting is intentionally off — the tree keeps its order. */
const columns: DataTableColumn[] = [
  { key: 'name', label: 'Сотрудник', width: 'fit-content(420px)', sortable: false },
  { key: 'role', label: 'Роль', width: 'fit-content(240px)', sortable: false },
  { key: 'manager', label: 'Руководитель', width: 'fit-content(280px)', sortable: false },
  { key: 'children', label: 'Подчинённых', width: '120px', sortable: false },
]

/** Per-user persisted column widths (drag-resize on the header edges). */
const { columnWidths } = useColumnWidths('structure')

/** All direct and indirect descendants of a user (cycle-safe) */
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

/** Manager options: all users except the user itself and its descendants, sorted by name */
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
  // A failed change is reported by the global toast (http.ts).
  await app.updateManager(user.id, managerId)
  saving.value = false
}

onMounted(() => {
  void app.loadAdminUsers()
  if (!users.value.length) void app.loadUsers()
})
</script>

<template>
  <section class="cs">
    <p v-if="adminUsersLoading && !tree.length" class="cs-st">Загрузка...</p>
    <p v-if="adminUsersError && !tree.length" class="cs-st er">{{ adminUsersError }}</p>

    <!--
      The table frame (header included) stays visible even when there is no
      data: the empty-state message is rendered inside the table instead of
      replacing it.
    -->
    <DataTable
      v-if="tree.length || (!adminUsersLoading && !adminUsersError)"
      :columns="columns"
      :rows="tree"
      title="Структура компании"
      empty-text="Нет данных"
      resizable
      v-model:column-widths="columnWidths"
    >
      <template #actions>
        <HintButton hint="structure" />
      </template>
      <template #cell="{ row, column }">
        <span v-if="column.key === 'name'" class="cs-name" :style="{ paddingLeft: asNode(row).depth * 22 + 'px' }">
          <span class="depth-tick" v-if="asNode(row).depth > 0">↳</span>
          <span class="name">{{ asNode(row).user.name }}</span>
          <span class="mono">{{ asNode(row).user.username }}</span>
        </span>
        <template v-else-if="column.key === 'role'">{{ presetLabel(asNode(row).user.preset) }}</template>
        <span v-else-if="column.key === 'manager'" class="cs-mgr-wrap">
          <select
            class="cs-mgr"
            :value="asNode(row).user.manager_id ?? ''"
            :disabled="saving"
            @change="onChangeManager(asNode(row).user, $event)"
          >
            <option v-for="opt in managerOptions(asNode(row).user)" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
          </select>
        </span>
        <template v-else>{{ asNode(row).childrenCount }}</template>
      </template>
    </DataTable>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

/* Loading / error placeholders outside the table */
.cs-st {
  color: var(--ui-text-muted);
  font-size: calc(var(--ui-font-scale, 1) * 14px);
  padding: 30px;
  text-align: center;
}
.er { color: var(--ui-danger); }
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: calc(var(--ui-font-scale, 1) * 12px);
  color: var(--ui-text-faint);
  margin-left: 8px;
}

/* Cell renders */
.cs-name {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
}
.name {
  font-weight: 700;
  color: var(--ui-accent);
}
.depth-tick {
  color: var(--ui-text-faint);
  margin-right: 6px;
}
.cs-mgr-wrap {
  display: block;
}
.cs-mgr {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 6px 10px;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
}
.cs-mgr:focus {
  border-color: var(--ui-accent);
}
</style>
