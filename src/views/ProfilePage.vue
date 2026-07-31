<script setup lang="ts">
interface ProfileField {
  label: string
  value: string
}

const profile: ProfileField[] = [
  { label: 'Имя', value: 'Иван Иванов' },
  { label: 'Должность', value: 'Руководитель проектов' },
  { label: 'Email', value: 'i.ivanov@mvs.local' },
  { label: 'Подразделение', value: 'Отдел инсталляции' },
]
</script>

<template>
  <section class="pf">
    <h2 class="pf-title">Профиль</h2>

    <div class="pf-card">
      <div v-for="field in profile" :key="field.label" class="pf-row">
        <span class="pf-label">{{ field.label }}</span>
        <span class="pf-value">{{ field.value }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pf-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 20px;
}

.pf-card {
  max-width: 520px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.pf-row {
  display: flex;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}
.pf-row:last-child { border-bottom: none; }

.pf-label {
  color: #888;
}
.pf-value {
  font-weight: 600;
  color: #333;
}
</style>
