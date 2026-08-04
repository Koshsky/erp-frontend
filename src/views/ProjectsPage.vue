<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import ProjectPlanning from '../components/planner/ProjectPlanning/ProjectPlanning.vue'
import { ContextMenu } from '../components/common'
import type { ContextMenuItem } from '../components/common/ContextMenu'
import { usePlanningStore, useAppStore } from '../store'
import type { PlanningMode, PlanningUnit } from '../components/planner/calendar'
import { addMonthsISO } from '../components/planner/calendar'

const store = usePlanningStore()
const app = useAppStore()
const { projectPlanning, loading, error } = storeToRefs(store)

const mode = ref<PlanningMode>('quarter')
const unit = ref<PlanningUnit>('day')
const anchor = ref<Date | null>(null)

const modeOptions: { value: PlanningMode; label: string }[] = [
  { value: 'quarter', label: '3 месяца' },
  { value: 'half', label: 'Полгода' },
  { value: 'year', label: 'Год' },
]

const unitOptions: { value: PlanningUnit; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'decade', label: 'Декада' },
]

// ПКМ по пустому месту: меню создания проекта (дата под курсором, вставка в позицию ПКМ)
// ПКМ по бару проекта: меню удаления проекта
interface MenuState {
  x: number
  y: number
  date: string
  rowIndex: number
  projectId?: number
}
const menu = ref<MenuState | null>(null)
const menuItems = computed<ContextMenuItem[]>(() =>
  menu.value?.projectId != null
    ? [{ id: 'delete-project', label: 'Удалить проект' }]
    : [{ id: 'create-project', label: 'Создать проект' }],
)

function onContextMenu(p: { clientX: number; clientY: number; date: string; rowIndex: number; projectId?: number }) {
  menu.value = { x: p.clientX, y: p.clientY, date: p.date, rowIndex: p.rowIndex, projectId: p.projectId }
}

async function onSelect(id: string) {
  if (!menu.value) return
  const { date, rowIndex, projectId } = menu.value
  if (id === 'create-project') {
    const ok = await store.createProject({
      code: 'КО_' + Date.now(),
      start_date: date,
      end_date: addMonthsISO(date, 6),
    }, rowIndex)
    if (!ok) error.value = store.error
  } else if (id === 'delete-project' && projectId != null) {
    if (!window.confirm('Удалить проект? Это удалит все его процессы, задачи и вехи.')) return
    const ok = await store.deleteProject(projectId)
    if (!ok) error.value = store.error
  }
}

onMounted(() => {
  store.loadProjectPlanning()
  if (!app.users.length) void app.loadUsers()
})
</script>

<template>
  <section class="pp">
    <div class="pp-head">
    <h2 class="pp-title">Проекты</h2>
      <div class="pp-period">
        <button
          v-for="opt in modeOptions"
          :key="opt.value"
          class="pp-period-btn"
          :class="{ active: mode === opt.value }"
          type="button"
          @click="mode = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="pp-period">
        <button
          v-for="opt in unitOptions"
          :key="opt.value"
          class="pp-period-btn"
          :class="{ active: unit === opt.value }"
          type="button"
          @click="unit = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <ProjectPlanning
      :projects="projectPlanning?.projects || []"
      :loading="loading"
      :error="error"
      :users="app.users"
      :anchor="anchor"
      :mode="mode"
      :unit="unit"
      @change="(p) => store.updateProjectDates(p.id, p.start_date, p.end_date)"
      @contextmenu="onContextMenu"
    />

    <ContextMenu
      :open="!!menu"
      :x="menu?.x ?? 0"
      :y="menu?.y ?? 0"
      :items="menuItems"
      @select="onSelect"
      @close="menu = null"
    />
  </section>
</template>

<style scoped>
.pp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}
.pp-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
}
.pp-period {
  display: inline-flex;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}
.pp-period-btn {
  border: none;
  background: transparent;
  padding: 8px 16px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.pp-period-btn + .pp-period-btn {
  border-left: 1px solid #e0e0e0;
}
.pp-period-btn:hover:not(.active) {
  background: #f6f8fa;
}
.pp-period-btn.active {
  background: #1a73e8;
  color: #fff;
  font-weight: 600;
}
.pp-st {
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.er { color: #d93025; }
</style>
