<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAuthStore } from '../store'

const auth = useAuthStore()

interface ProfileField {
  label: string
  value: string
}

// Real profile of the current user, fetched from the API (auth.user)
const profile = computed<ProfileField[]>(() => {
  const u = auth.user
  return [
    { label: 'Логин', value: u?.username || '—' },
    { label: 'Имя', value: u?.name || '—' },
    { label: 'Пресет прав', value: u?.preset || '—' },
    { label: 'ID', value: u?.id != null ? String(u.id) : '—' },
  ]
})

onMounted(() => {
  const id = auth.user?.id
  if (id != null) auth.fetchProfile(id)
})
</script>

<template>
  <section class="pf">
    <div class="pf-head">
      <h2 class="pf-title">Профиль</h2>
      <!-- Square icon button → the "Редактирование профиля" page -->
      <RouterLink
        to="/profile/edit"
        class="pf-edit"
        title="Редактировать профиль"
        aria-label="Редактировать профиль"
      >
        <!-- Pencil icon (line style, matches the CopyField/PasswordField icons) -->
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      </RouterLink>
    </div>

    <div class="pf-cards">
      <div class="pf-card">
        <div v-for="field in profile" :key="field.label" class="pf-row">
          <span class="pf-label">{{ field.label }}</span>
          <span class="pf-value">{{ field.value }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.pf-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 20px;
}

/* Header row: title + square edit button */
.pf-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.pf-head .pf-title {
  margin-bottom: 0;
}

.pf-cards {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
}

.pf-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  overflow: hidden;
}

.pf-row {
  display: flex;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--ui-border);
  font-size: 14px;
}
.pf-row:last-child { border-bottom: none; }

.pf-label {
  color: var(--ui-text-faint);
}
.pf-value {
  font-weight: 600;
  color: var(--ui-text);
}

/* Square icon button → the edit page */
.pf-edit {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: background var(--ui-duration), color var(--ui-duration), transform 0.1s;
}

.pf-edit:hover {
  background: var(--ui-surface-3);
  color: var(--ui-accent);
}

.pf-edit:active {
  transform: scale(0.96);
}
</style>