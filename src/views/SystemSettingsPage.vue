<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { getApiUrl, setApiUrl, hasApiUrlOverride, httpSchemeWarning } from '../config'
import { autoSync, saveSyncSettings, getWarmupStep, toggleWarmupStep } from '../settings'
import { viewSettings, SCALE_MIN, SCALE_MAX, SCALE_STEP, CELL_ZOOM_MIN, CELL_ZOOM_MAX, CELL_ZOOM_STEP } from '../settings'
import { clearLocalData } from '../offline/reset'

const apiUrl = ref('')
const apiUrlWarn = ref<string | null>(null)
const statusMsg = ref<string | null>(null)
const statusOk = ref(false)
const clearing = ref(false)

/**
 * Per-domain warm-up steps the user can switch on/off. Names mirror the steps
 * built in warmup.ts (buildPullSteps); labels are Russian for the UI.
 */
const warmupSteps: Array<{ name: string; label: string }> = [
  { name: 'permissions', label: 'Права доступа' },
  { name: 'profile', label: 'Профиль' },
  { name: 'projects', label: 'Проекты' },
  { name: 'resources', label: 'Ресурсы' },
  { name: 'members', label: 'Члены ресурсов' },
  { name: 'users', label: 'Пользователи' },
  { name: 'myStaff', label: 'Ответственные (кандидаты)' },
  { name: 'project-plan', label: 'План проектов' },
  { name: 'process-plan', label: 'План процессов' },
  { name: 'task-plan', label: 'План задач' },
  { name: 'assignments', label: 'Назначения' },
  { name: 'states', label: 'Состояния табеля' },
  { name: 'employees', label: 'Сотрудники' },
  { name: 'periods', label: 'Периоды табеля' },
  { name: 'calendar', label: 'Календарь доступности' },
]

function okMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = true
}

function failMsg(msg: string) {
  statusMsg.value = msg
  statusOk.value = false
}

/** Applies the URL from the field to the runtime config; false — invalid URL */
function applyApiUrl(): boolean {
  apiUrlWarn.value = httpSchemeWarning(apiUrl.value)
  const applied = setApiUrl(apiUrl.value, true)
  if (!applied) {
    failMsg('Некорректный API_URL: ожидается http(s)://…')
  }
  return applied
}

/** The "Save" button for API_URL: validates and saves to localStorage */
function onSaveApiUrl() {
  statusMsg.value = null
  if (!applyApiUrl()) return
  okMsg('API_URL сохранён')
}

/** Switches a warm-up domain on/off and persists */
function onToggleWarmup(name: string) {
  toggleWarmupStep(name)
}

/** Clears all local (offline) data and reloads; reports a blocked deletion
 *  (another window/tab holds the local database) instead of pretending success */
async function onClearLocalData() {
  if (clearing.value) return
  clearing.value = true
  statusMsg.value = null
  try {
    const ok = await clearLocalData()
    // On success the page reloads; reaching here means the database was NOT
    // deleted (e.g. another window still holds a connection).
    if (!ok) {
      failMsg('Не удалось сбросить локальные данные: их удерживает другое окно приложения — закройте его и повторите')
    }
  } finally {
    clearing.value = false
  }
}

watch(autoSync, saveSyncSettings)

onMounted(() => {
  apiUrl.value = getApiUrl() ?? ''
})
</script>

<template>
  <section class="st">
    <h2 class="st-title">Настройки</h2>
    <p class="st-hint st-hint--top">
      Слева — офлайн-синхронизация и прогресс; справа — отображение диаграмм. Настройки вида хранятся в этом браузере и применяются при открытии диаграмм.
    </p>

    <div class="st-layout">
      <div class="st-pane">
        <div class="st-card">
          <h3 class="st-card-title">Синхронизация</h3>
          <label class="st-option">
            <input v-model="autoSync" type="checkbox" />
            <span>Автосинхронизация при запуске и возврате сети</span>
          </label>
        </div>

        <div class="st-card">
          <h3 class="st-card-title">Какие данные прогревать</h3>
          <p class="st-hint">
            Отключайте домены, которые не нужны офлайну, чтобы ускорить прогревку.
          </p>
          <div class="st-grid">
            <label v-for="step in warmupSteps" :key="step.name" class="st-option">
              <input
                type="checkbox"
                :checked="getWarmupStep(step.name)"
                @change="onToggleWarmup(step.name)"
              />
              <span>{{ step.label }}</span>
            </label>
          </div>
        </div>

        <div class="st-card">
          <h3 class="st-card-title">Подключение</h3>
          <label class="st-field">
            <span>API_URL бэкенда</span>
            <input v-model="apiUrl" type="text" spellcheck="false" placeholder="https://host/api/v1" />
          </label>
          <p v-if="apiUrlWarn" class="st-msg warn">{{ apiUrlWarn }}</p>
          <div class="st-actions st-actions--tight">
            <button type="button" class="st-btn st-btn--sm" @click="onSaveApiUrl">
              Сохранить
            </button>
          </div>
          <p class="st-hint">
            Источник: {{ hasApiUrlOverride() ? 'задан вручную' : 'по умолчанию' }}.
          </p>
        </div>

        <div class="st-card">
          <h3 class="st-card-title">Очистить локальные данные</h3>
          <p class="st-hint">
            Удаляет очередь изменений, кэш и выход из аккаунта, затем перезагружает
            приложение.
          </p>
          <button type="button" class="st-btn danger" :disabled="clearing" @click="onClearLocalData">
            Очистить локальные данные
          </button>
        </div>
      </div>

      <div class="st-pane">
        <div class="st-card">
          <h3 class="st-card-title">Бейджи на диаграммах</h3>
          <p class="st-hint">Какие видимые отметки рисовать на барах задач, процессов и проектов.</p>
          <label class="st-option">
            <input v-model="viewSettings.badgeResource" type="checkbox" />
            <span>Ресурсы (специализации) на задачах</span>
          </label>
          <label class="st-option">
            <input v-model="viewSettings.badgeProjectCode" type="checkbox" />
            <span>Код проекта на барах</span>
          </label>
          <label class="st-option">
            <input v-model="viewSettings.badgeProgress" type="checkbox" />
            <span>Процент выполнения операций на задачах</span>
          </label>
          <label class="st-option">
            <input v-model="viewSettings.badgeOwner" type="checkbox" />
            <span>Ответственный (задачи) / владелец (процессы и проекты)</span>
          </label>
        </div>

        <div class="st-card">
          <h3 class="st-card-title">Масштаб и календарь при открытии</h3>
          <div class="st-field">
            <span>Стандартный масштаб диаграммы</span>
            <div class="st-scale-row">
              <input
                v-model.number="viewSettings.defaultScale"
                type="range"
                :min="SCALE_MIN"
                :max="SCALE_MAX"
                :step="SCALE_STEP"
                class="st-scale"
              />
              <span class="st-scale-value">{{ viewSettings.defaultScale }}%</span>
            </div>
            <p class="st-hint">От {{ SCALE_MIN }}% до {{ SCALE_MAX }}% — применяется при открытии диаграммы</p>
          </div>
          <div class="st-field">
            <span>Ширина ячейки при открытии</span>
            <div class="st-scale-row">
              <input
                v-model.number="viewSettings.defaultCellZoom"
                type="range"
                :min="CELL_ZOOM_MIN"
                :max="CELL_ZOOM_MAX"
                :step="CELL_ZOOM_STEP"
                class="st-scale"
              />
              <span class="st-scale-value">{{ viewSettings.defaultCellZoom }}%</span>
            </div>
            <p class="st-hint">
              От {{ CELL_ZOOM_MIN }}% до {{ CELL_ZOOM_MAX }}% ширины колонки этого окна — как после
              Ctrl+Shift+колесо. 100% = автоматически по ширине окна.
            </p>
          </div>
          <div class="st-field">
            <span>Единица календаря по умолчанию</span>
            <div class="st-actions">
              <label class="st-radio">
                <input v-model="viewSettings.defaultUnit" type="radio" value="day" />
                <span>Дни</span>
              </label>
              <label class="st-radio">
                <input v-model="viewSettings.defaultUnit" type="radio" value="decade" />
                <span>Декады</span>
              </label>
            </div>
          </div>
        </div>

        <div class="st-card">
          <h3 class="st-card-title">Экспорт диаграмм</h3>
          <label class="st-option">
            <input v-model="viewSettings.showPdfButtons" type="checkbox" />
            <span>Показывать кнопки «Сохранить в PDF» и «Печать» над диаграммой</span>
          </label>
          <p class="st-hint">Сочетание Ctrl/Cmd+P работает всегда.</p>
        </div>
      </div>
    </div>

    <p v-if="statusMsg" class="st-status-msg" :class="{ ok: statusOk }">{{ statusMsg }}</p>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.st-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 20px;
}

.st-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
  padding: 20px;
  margin-bottom: 24px;
}

.st-card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 16px;
}

.st-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--ui-text-muted);
}

.st-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  font-size: 13px;
  color: var(--ui-text-2);
  cursor: pointer;
}

.st-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 2px 24px;
}

.st-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-2);
}

.st-field input[type='text'],
.st-field input[type='password'],
.st-field input[type='number'] {
  padding: 11px 14px;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  font-size: 14px;
  font-weight: 400;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}

.st-field input:focus {
  outline: none;
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.st-btn {
  margin-top: 14px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-accent);
  color: var(--ui-accent-on);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--ui-duration), opacity var(--ui-duration);
}

.st-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent) 88%, black);
}

.st-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.st-btn.danger {
  background: var(--ui-danger);
}

.st-btn.danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-danger) 88%, black);
}

.st-btn--sm {
  width: auto;
  margin-top: 0;
  padding: 9px 16px;
  font-size: 13px;
}

.st-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.st-actions--tight {
  margin-top: 0;
}

.st-msg {
  font-size: 13px;
  color: var(--ui-warning);
  margin: 0 0 10px;
}

.st-status-msg {
  font-size: 13px;
  color: var(--ui-danger);
  margin: 14px 0 0;
}

.st-status-msg.ok {
  color: var(--ui-success);
}

/* Two-column settings layout: left = sync/offline, right = diagram appearance */
.st-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.st-pane {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}
.st-hint--top {
  margin: -8px 0 20px;
}
.st-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text-2);
  cursor: pointer;
  padding: 5px 0;
}
.st-scale-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}
.st-scale {
  flex: 1;
  min-width: 0;
  accent-color: var(--ui-accent);
  cursor: pointer;
}
.st-scale-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text);
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: right;
}

@media (max-width: 900px) {
  .st-layout {
    grid-template-columns: 1fr;
  }
}
</style>
