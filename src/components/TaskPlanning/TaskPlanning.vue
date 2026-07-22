<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getAllResources } from '../../api.js'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import ResourceHeader from './components/ResourceHeader/ResourceHeader.vue'
import TaskGantt from './components/TaskGantt/TaskGantt.vue'
import type { Resource } from './components/ResourceHeader/types'
import type { Process } from './types'

const props = defineProps<{
  mockProcesses?: Process[] | null
  mockResources?: Resource[] | null
}>()

const resources = ref<Resource[]>([])
const processes = ref<Process[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const dayList = computed(() => {
  if (!processes.value.length) return []
  let min = Infinity, max = -Infinity
  for (const proc of processes.value) {
    if (!proc.tasks || !proc.tasks.length) continue
    for (const t of proc.tasks) {
      const ts = new Date(t.start_date).getTime()
      const te = new Date(t.end_date).getTime()
      if (ts < min) min = ts
      if (te > max) max = te
    }
  }
  const days: Date[] = []
  const cur = new Date(min)
  const end = new Date(max)
  while (cur <= end) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
})

function usageForDay(resourceId: number, day: Date): number {
  let used = 0
  for (const proc of processes.value) {
    if (!proc.tasks) continue
    for (const t of proc.tasks) {
      const d = day.getTime()
      if (d < new Date(t.start_date).getTime() || d >= new Date(t.end_date).getTime()) continue
      const a = (t.resources || []).find(r => r.resource_id === resourceId)
      if (a) used += a.quantity
    }
  }
  return used
}

const gridCols = computed(() => {
  if (!dayList.value.length) return '180px'
  return `180px repeat(${dayList.value.length}, 1fr)`
})

const dayZero = computed<Date | null>(() => dayList.value.length ? dayList.value[0] : null)

onMounted(async () => {
  if (props.mockProcesses) {
    processes.value = props.mockProcesses
    resources.value = props.mockResources || []
    return
  }
  loading.value = true
  try {
    const resRes = await getAllResources()
    resources.value = resRes?.data || []
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
})
</script>

<template>
  <div class="pg">
    <div v-if="loading" class="st">Загрузка...</div>
    <div v-else-if="error" class="st er">{{ error }}</div>

    <template v-else-if="processes.length && dayList.length">
      <div class="gg" :style="{ gridTemplateColumns: gridCols }">

        <CalendarHeader :startDate="dayList[0]" :endDate="dayList[dayList.length-1]" />

        <ResourceHeader
          :dayList="dayList"
          :resources="resources"
          :usageFn="usageForDay"
        />

        <div class="sep" style="gridColumn:1/-1"></div>

        <template v-for="(proc, pi) in processes" :key="'proc'+proc.id">
          <TaskGantt
            :dayZero="dayZero"
            :totalDays="dayList.length"
            :title="proc.title"
            :projectCode="proc.project_code"
            :tasks="proc.tasks || []"
            :groupStartDate="proc.start_date"
            :groupEndDate="proc.end_date"
          />
        </template>
      </div>
    </template>

    <div v-else class="st">Нет данных</div>
  </div>
</template>

<style scoped>
.pg {
  background: #fff; border-radius: 10px; padding: 12px;
  box-shadow: 0 1px 6px rgba(0,0,0,.08); overflow-x: auto;
}
.st { text-align:center; padding:30px; color:#666; font-size:14px; }
.er { color:#d93025; }
.gg { display: grid; min-width: 600px; }
.sep { border: none; border-bottom: 2px solid #1a73e8; margin: 4px 0; height: 0; }

.c {
  border: 1px solid #e8e8e8;
  text-align: center;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lc {
  position: sticky; left: 0; background: #fff; z-index: 2;
  text-align: left; padding: 4px 8px !important;
  border-left: none; justify-content: flex-start; overflow: hidden;
}

</style>