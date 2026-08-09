<script setup lang="ts">
/** Read-only матрица прав доступа: единый источник — матрица в бэкенде
 * (internal/rbac/policy.go). Страница дублирует её для наглядности. */

interface MatrixCell {
  /** Короткая подпись в ячейке */
  label: string
  /** Расшифровка в тултипе/подвале */
  hint?: string
}

interface MatrixRow {
  action: string
  cells: Record<string, MatrixCell>
}

interface MatrixBlock {
  entity: string
  rows: MatrixRow[]
}

const ROLE_COLS = [
  { key: 'admin', label: 'Админ' },
  { key: 'dp', label: 'Директор проектов' },
  { key: 'rp', label: 'Руководитель проекта' },
  { key: 'vp', label: 'Владелец процесса' },
  { key: 'worker', label: 'Работник' },
]

const empty: MatrixCell = { label: '—' }

const MATRIX: MatrixBlock[] = [
  {
    entity: 'Проекты',
    rows: [
      { action: 'Просмотр', cells: { admin: { label: 'все' }, dp: { label: 'все' }, rp: { label: 'свои' }, vp: empty, worker: empty } },
      { action: 'Создание', cells: { admin: { label: 'да' }, dp: empty, rp: { label: 'да', hint: 'себе в владение' }, vp: empty, worker: empty } },
      { action: 'Изменение (код/даты/приоритет)', cells: { admin: { label: 'все' }, dp: { label: 'все' }, rp: { label: 'свои', hint: 'владельца не меняет' }, vp: empty, worker: empty } },
      { action: 'Удаление', cells: { admin: { label: 'все' }, dp: empty, rp: { label: 'свои' }, vp: empty, worker: empty } },
    ],
  },
  {
    entity: 'Процессы',
    rows: [
      { action: 'Просмотр', cells: { admin: { label: 'все' }, dp: { label: 'все' }, rp: { label: 'своих проектов' }, vp: { label: 'свои' }, worker: empty } },
      { action: 'Создание', cells: { admin: { label: 'да' }, dp: empty, rp: { label: 'в своих проектах' }, vp: empty, worker: empty } },
      { action: 'Изменение', cells: { admin: { label: 'все' }, dp: empty, rp: { label: 'в своих проектах' }, vp: empty, worker: empty } },
      { action: 'Удаление', cells: { admin: { label: 'все' }, dp: empty, rp: { label: 'в своих проектах' }, vp: empty, worker: empty } },
    ],
  },
  {
    entity: 'Задачи / Вехи / Назначения ресурсов',
    rows: [
      { action: 'Просмотр', cells: { admin: { label: 'все' }, dp: { label: 'все' }, rp: { label: 'своих проектов' }, vp: { label: 'своих процессов' }, worker: empty } },
      { action: 'Создание', cells: { admin: { label: 'да' }, dp: empty, rp: empty, vp: { label: 'в своих процессах' }, worker: empty } },
      { action: 'Изменение', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: { label: 'в своих процессах' }, worker: empty } },
      { action: 'Удаление', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: { label: 'в своих процессах' }, worker: empty } },
    ],
  },
  {
    entity: 'Ресурсы табеля',
    rows: [
      { action: 'Просмотр', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: { label: 'свои' }, worker: empty } },
      { action: 'Создание', cells: { admin: { label: 'да' }, dp: empty, rp: empty, vp: { label: 'да', hint: 'себе в собственность' }, worker: empty } },
      { action: 'Изменение', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: { label: 'свои' }, worker: empty } },
      { action: 'Удаление', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: { label: 'свои' }, worker: empty } },
    ],
  },
  {
    entity: 'Сотрудники',
    rows: [
      { action: 'Просмотр', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: { label: 'свои' }, worker: empty } },
      { action: 'Создание', cells: { admin: { label: 'да' }, dp: empty, rp: empty, vp: { label: 'да', hint: 'себе в подчинение' }, worker: empty } },
      { action: 'Изменение', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: { label: 'свои' }, worker: empty } },
      { action: 'Удаление', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: { label: 'свои' }, worker: empty } },
    ],
  },
  {
    entity: 'Статусы',
    rows: [
      { action: 'Просмотр', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: { label: 'да', hint: 'справочник для табеля' }, worker: empty } },
      { action: 'Создание', cells: { admin: { label: 'да' }, dp: empty, rp: empty, vp: empty, worker: empty } },
      { action: 'Изменение', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: empty, worker: empty } },
      { action: 'Удаление', cells: { admin: { label: 'все' }, dp: empty, rp: empty, vp: empty, worker: empty } },
    ],
  },
]
</script>

<template>
  <section class="pm">
    <div class="pm-head">
      <h2 class="pm-title">Права доступа</h2>
      <p class="pm-note">Матрица захардкожена в бэкенде (<code>internal/rbac</code>) и применяется на всех операциях. Здесь — справочное отображение.</p>
    </div>

    <div v-for="block in MATRIX" :key="block.entity" class="pm-block">
      <h3 class="pm-entity">{{ block.entity }}</h3>
      <div class="table">
        <div class="tr th">
          <div class="pm-action">Действие</div>
          <div v-for="col in ROLE_COLS" :key="col.key" class="pm-role">{{ col.label }}</div>
        </div>
        <div v-for="row in block.rows" :key="row.action" class="tr">
          <div class="pm-action">{{ row.action }}</div>
          <div v-for="col in ROLE_COLS" :key="col.key" class="pm-cell" :title="row.cells[col.key]?.hint">
            {{ row.cells[col.key]?.label }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pm-head {
  margin-bottom: 20px;
}
.pm-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 6px;
}
.pm-note {
  color: #666;
  font-size: 13px;
  margin: 0;
}
.pm-note code {
  background: #eef1f5;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
}
.pm-block {
  margin-bottom: 28px;
}
.pm-entity {
  font-size: 16px;
  font-weight: 700;
  color: #1a3a6b;
  margin: 0 0 10px;
}
.table {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: 220px repeat(5, 1fr);
  gap: 8px;
  padding: 11px 16px;
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
.pm-action {
  font-weight: 500;
  color: #2c3e50;
}
.pm-role {
  text-align: center;
  color: #444;
}
.pm-cell {
  text-align: center;
  color: #333;
}
</style>
