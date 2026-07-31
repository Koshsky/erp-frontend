<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../store'

const store = useAppStore()
const { resources, resourcesLoading, resourcesError } = storeToRefs(store)

onMounted(() => {
  if (!resources.value.length) store.loadResources()
})
</script>

<template>
  <section class="rp">
    <h2 class="rp-title">Ресурсы</h2>

    <p v-if="resourcesLoading" class="rp-st">Загрузка...</p>
    <p v-else-if="resourcesError" class="rp-st er">{{ resourcesError }}</p>

    <div v-else-if="resources.length" class="table">
      <div class="tr th">
        <div>Код</div>
        <div>Название</div>
        <div>Количество</div>
      </div>
      <div v-for="res in resources" :key="res.id" class="tr">
        <div class="code">{{ res.code }}</div>
        <div>{{ res.title }}</div>
        <div>{{ res.quantity }}</div>
      </div>
    </div>

    <p v-else class="rp-st">Нет данных о ресурсах</p>
  </section>
</template>

<style scoped>
.rp-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 20px;
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
