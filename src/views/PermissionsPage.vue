<script setup lang="ts">
/** Read-only матрица прав доступа: единый источник — матрица в бэкенде
 * (internal/rbac/policy.go). Страница дублирует её для наглядности. */
import { TooltipCell, InfoTooltip } from '@/components/common'

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
      { action: 'Просмотр', cells: { admin: { label: 'все' }, dp: { label: 'все' }, rp: { label: 'своих проектов' }, vp: { label: 'все', hint: 'изменять может только свои' }, worker: empty } },
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

/** Одно право в сводке роли. */
interface RolePermission {
  /** Краткое название права (сущность + действие). */
  title: string
  /** Что именно может роль в рамках этого права. */
  description: string
}

/** Сводка по одной роли. */
interface RoleSummary {
  key: string
  title: string
  /** Общее описание роли и её места в системе. */
  description: string
  /** Листинг прав роли с описаниями. */
  permissions: RolePermission[]
}

/** Сводки по ролям — «кто что может», для быстрого ознакомления. */
const ROLE_SUMMARIES: RoleSummary[] = [
  {
    key: 'admin',
    title: 'Админ',
    description: 'Полный доступ: все сущности и операции, листинги в скоупе «все».',
    permissions: [
      { title: 'Проекты — все операции', description: 'Просмотр, создание, изменение и удаление любых проектов, включая приоритет.' },
      { title: 'Процессы — все операции', description: 'Полное управление процессами во всех проектах.' },
      { title: 'Задачи, вехи, назначения — все операции', description: 'Полное управление задачами, вехами и назначениями ресурсов.' },
      { title: 'Ресурсы табеля — все операции', description: 'Просмотр и управление ресурсами любого владельца.' },
      { title: 'Сотрудники — все операции', description: 'Просмотр и управление всеми сотрудниками.' },
      { title: 'Статусы — все операции', description: 'Просмотр и управление справочником статусов табеля.' },
      { title: 'Листинги — фильтр по владельцу', description: 'Может запрашивать списки любого владельца (owner_id/manager_id) и пагинировать.' },
    ],
  },
  {
    key: 'dp',
    title: 'Директор проектов',
    description: 'Read-only директор портфеля: видит всё планирование, правит приоритеты проектов, но не создаёт и не удаляет.',
    permissions: [
      { title: 'Проекты — просмотр всех + изменение', description: 'Видит все проекты, может менять код, даты и приоритет.' },
      { title: 'Процессы — просмотр всех', description: 'Видит все процессы во всех проектах.' },
      { title: 'Задачи, вехи, назначения — просмотр всех', description: 'Видит все задачи, вехи и назначения.' },
      { title: 'Создание / удаление — нет', description: 'Не может создавать или удалять проекты, процессы и задачи.' },
      { title: 'Ресурсы, сотрудники, статусы — нет доступа', description: 'Управление табелем и справочниками недоступно.' },
    ],
  },
  {
    key: 'rp',
    title: 'Руководитель проекта',
    description: 'Управляет своими проектами и процессами внутри них; чужие проекты не видит (скоуп «только своё»).',
    permissions: [
      { title: 'Проекты — свои', description: 'Просмотр, изменение и удаление только своих проектов; создаёт проекты себе во владение.' },
      { title: 'Процессы — в своих проектах', description: 'Создание, изменение и удаление процессов в своих проектах.' },
      { title: 'Задачи, вехи, назначения — просмотр', description: 'Видит задачи, вехи и назначения своих проектов; изменять их не может (это vp).' },
      { title: 'Ресурсы, сотрудники — нет доступа', description: 'Списки ресурсов и сотрудников недоступны.' },
      { title: 'Листинги — скоуп «только своё»', description: 'Списки возвращают только данные с его owner_id.' },
    ],
  },
  {
    key: 'vp',
    title: 'Владелец процесса',
    description: 'Управляет табелем: задачи в своих процессах, свои ресурсы и сотрудники (скоуп «только своё»).',
    permissions: [
      { title: 'Процессы — просмотр всех', description: 'Видит все процессы во всех проектах; изменять может только свои.' },
      { title: 'Задачи, вехи, назначения — в своих процессах', description: 'Создание, изменение и удаление задач, вех и назначений в своих процессах.' },
      { title: 'Ресурсы — свои', description: 'Просмотр, создание, изменение и удаление своих ресурсов табеля.' },
      { title: 'Сотрудники — свои', description: 'Просмотр и управление своими подчинёнными (manager_id = пользователь).' },
      { title: 'Статусы — просмотр', description: 'Видит справочник статусов для табеля.' },
      { title: 'Листинги — скоуп «только своё»', description: 'Списки ресурсов и сотрудников возвращают только его данные.' },
    ],
  },
  {
    key: 'worker',
    title: 'Работник',
    description: 'Базовый доступ без прав на операции: листинги и управление недоступны (скоуп «ничего»).',
    permissions: [
      { title: 'Проекты, процессы, задачи — просмотр', description: 'Видит данные планирования в планировщике (только доступные по скоупу).' },
      { title: 'Создание, изменение, удаление — нет', description: 'Не может создавать, изменять или удалять данные.' },
      { title: 'Ресурсы, сотрудники, статусы, админ-разделы — недоступно', description: 'Нет доступа к табелю, ресурсам, сотрудникам и административным разделам.' },
    ],
  },
]
</script>

<template>
  <section class="pm">
    <div class="pm-head">
      <h2 class="pm-title">Права доступа</h2>
      <p class="pm-note">
        Матрица хранится в бэкенде (<code>internal/policies</code>) и применяется на всех операциях, включая
        листинги (скоупы «все / только своё / ничего»). Здесь — справочное отображение.
      </p>
    </div>

    <h3 class="pm-section-title">Матрица операций</h3>
    <div v-for="block in MATRIX" :key="block.entity" class="pm-block">
      <h3 class="pm-entity">{{ block.entity }}</h3>
      <div class="table">
        <div class="tr th">
          <div class="pm-action">Действие</div>
          <div v-for="col in ROLE_COLS" :key="col.key" class="pm-role">{{ col.label }}</div>
        </div>
        <div v-for="row in block.rows" :key="row.action" class="tr">
          <div class="pm-action">{{ row.action }}</div>
          <TooltipCell
            v-for="col in ROLE_COLS"
            :key="col.key"
            class="pm-cell"
          >
            {{ row.cells[col.key]?.label }}
            <template v-if="row.cells[col.key]?.hint" #popup>
              <InfoTooltip :lines="[row.cells[col.key]!.hint].filter((x): x is string => Boolean(x))" />
            </template>
          </TooltipCell>
        </div>
      </div>
    </div>

    <h3 class="pm-section-title">Сводка по ролям</h3>
    <div class="pm-roles">
      <div v-for="role in ROLE_SUMMARIES" :key="role.key" class="pm-role-card">
        <div class="pm-role-head">
          <span class="pm-role-name">{{ role.title }}</span>
          <span class="pm-role-key">{{ role.key }}</span>
        </div>
        <p class="pm-role-desc">{{ role.description }}</p>
        <ul class="pm-role-list">
          <li v-for="p in role.permissions" :key="p.title" class="pm-role-item">
            <span class="pm-role-item-title">{{ p.title }}</span>
            <span class="pm-role-item-desc">{{ p.description }}</span>
          </li>
        </ul>
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
.pm-section-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a3a6b;
  margin: 0 0 14px;
}
.pm-roles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}
.pm-role-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pm-role-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.pm-role-name {
  font-size: 16px;
  font-weight: 700;
  color: #2c3e50;
}
.pm-role-key {
  font-size: 11px;
  font-weight: 600;
  color: #7a8699;
  background: #f1f4f9;
  border-radius: 999px;
  padding: 2px 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.pm-role-desc {
  margin: 0;
  font-size: 13px;
  color: #555;
  line-height: 1.45;
}
.pm-role-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pm-role-item {
  border-top: 1px solid #f0f0f0;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pm-role-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a3a6b;
}
.pm-role-item-desc {
  font-size: 12.5px;
  color: #666;
  line-height: 1.4;
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
