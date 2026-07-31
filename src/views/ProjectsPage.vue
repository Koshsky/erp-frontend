<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import ProjectPlanning from '../components/planner/ProjectPlanning/ProjectPlanning.vue'
import { usePlanningStore } from '../store'
import type { PlanningPeriod } from '../components/planner/ProjectPlanning/types'

const store = usePlanningStore()
const { projectPlanning, loading, error } = storeToRefs(store)

const period = ref<PlanningPeriod>('quarter')

const periodOptions: { value: PlanningPeriod; label: string }[] = [
  { value: 'quarter', label: '3 месяца' },
  { value: 'half', label: 'Полгода' },
  { value: 'year', label: 'Год' },
]

onMounted(() => {
  store.loadProjectPlanning()
})
</script>

<template>
  <section class="pp">
    <div class="pp-head">
    <h2 class="pp-title">Проекты</h2>
      <div class="pp-period">
        <button
          v-for="opt in periodOptions"
          :key="opt.value"
          class="pp-period-btn"
          :class="{ active: period === opt.value }"
          type="button"
          @click="period = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="pp-st">Загрузка...</p>
    <p v-else-if="error" class="pp-st er">{{ error }}</p>

    <ProjectPlanning
      v-else
      :projects="projectPlanning?.projects || []"
      :period="period"
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


