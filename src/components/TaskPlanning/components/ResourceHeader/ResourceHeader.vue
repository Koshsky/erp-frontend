<script setup lang="ts">
import TooltipCell from '../../../TooltipCell/TooltipCell.vue'
import UsageCell from '../UsageCell/UsageCell.vue'
import type { Resource } from './types'

const props = defineProps<{
  dayList: Date[]
  resources: Resource[]
  usageFn: (resourceId: number, day: Date) => number
}>()
</script>

<template>
  <template v-for="res in resources" :key="'r'+res.id">
    <div class="c lc rl">
      <TooltipCell :text="res.title">
      <span class="rt">{{ res.code }}</span>
      </TooltipCell>
    </div>
    <div v-for="(d,i) in dayList" :key="'rc'+i" class="c" style="padding:0!important">
      <UsageCell
        :used="usageFn(res.id, d)"
        :total="res.quantity"
        :isWeekend="d.getDay()===0 || d.getDay()===6"
      />
    </div>
  </template>
</template>

<style scoped>
.c {
  border: 1px solid #e8e8e8;
  text-align: center;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lc {
  position: sticky; left: 0; background: #fff; z-index: 2;
  text-align: left; padding: 2px 6px !important;
  border-left: none;
  overflow: visible;
}
.rl {
  overflow: visible;
  display: flex;
  align-items: center;
  min-height: 24px;
  cursor: default;
}
.rt {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.5px;
}
</style>
