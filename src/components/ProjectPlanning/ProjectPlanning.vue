<script setup lang="ts">
import { ref, computed } from 'vue'
import CalendarHeader from '../CalendarHeader/CalendarHeader.vue'
import ProjectBar from './components/ProjectBar/ProjectBar.vue'
import type { ProjectItem } from './types'

const props = defineProps<{
  projects?: ProjectItem[] | null
}>()

const projects = ref<ProjectItem[]>(props.projects || [])

const dayList = computed(() => {
  if (!projects.value.length) return []
  let min = Infinity, max = -Infinity
  for (const p of projects.value) {
    const ts = new Date(p.start_date).getTime()
    const te = new Date(p.end_date).getTime()
    if (ts < min) min = ts
    if (te > max) max = te
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

const gridCols = computed(() => {
  if (!dayList.value.length) return '180px'
  return `180px repeat(${dayList.value.length}, 1fr)`
})

const dayZero = computed<Date | null>(() => dayList.value.length ? dayList.value[0] : null)
</script>

<template>
  <div class="pg">
    <template v-if="projects.length && dayList.length">
      <div class="gg" :style="{ gridTemplateColumns: gridCols }">

        <CalendarHeader :startDate="dayList[0]" :endDate="dayList[dayList.length-1]" />

        <div class="sep" style="gridColumn:1/-1"></div>

        <template v-for="project in projects" :key="'proj'+project.id">
          <div class="c lc ph">
            <span class="ph-code">{{ project.project_code }}</span>
          </div>
          <div class="bar-cell" style="gridColumn:2/-1">
            <ProjectBar
              :dayZero="dayZero!"
              :totalDays="dayList.length"
              :startDate="project.start_date"
              :endDate="project.end_date"
              :projectCode="project.project_code"
            />
          </div>
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
.gg { display: grid; min-width: 600px; }
.sep { border: none; border-bottom: 2px solid #1a73e8; margin: 4px 0; height: 0; }

.c {
  border: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  font-size: 12px;
}
.lc {
  position: sticky; left: 0; background: #fff; z-index: 2;
  text-align: left; padding: 4px 8px !important;
  border-left: none; overflow: hidden;
}
.ph {
  min-height: 32px;
  background: #f0f7ff;
  font-weight: 700; font-size: 13px; color: #1a73e8;
}
.ph-code {
  font-size: 12px;
  color: #1a73e8;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.bar-cell {
  position: relative; min-height: 36px;
  border: 1px solid #e8e8e8; border-top: none; background: #fff;
}
</style>
