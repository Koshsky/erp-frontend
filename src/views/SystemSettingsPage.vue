<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { getApiUrl, setApiUrl, hasApiUrlOverride, httpSchemeWarning } from '../config'
import { scheme, setScheme } from '../theme'
import { autoSync, saveSyncSettings } from '../settings'
import {
  notificationsEnabled,
  notifyDurationMs,
  NOTIFY_DURATION_OPTIONS,
  saveNotifySettings,
} from '../settings'
import {
  uiFontSize,
  applyUiSize,
  tablePageSize,
  TABLE_PAGE_SIZE_OPTIONS,
  saveUiSettings,
} from '../settings'
import { viewSettings, uiLanguage, SCALE_MIN, SCALE_MAX, SCALE_STEP, CELL_ZOOM_MIN, CELL_ZOOM_MAX, CELL_ZOOM_STEP, PROJECT_DAYS_MIN, PROJECT_DAYS_MAX } from '../settings'
import { notifyError, notifyInfo, notifySuccess } from '../notify/state'

type SettingsSection = 'interface' | 'tables' | 'diagrams' | 'sync' | 'connection'

const activeSection = ref<SettingsSection>('interface')

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'interface', label: 'Интерфейс' },
  { id: 'tables', label: 'Таблицы' },
  { id: 'diagrams', label: 'Диаграммы' },
  { id: 'sync', label: 'Синхронизация' },
  { id: 'connection', label: 'Подключение' },
]

const apiUrl = ref('')

/** Clamps the typed project duration into the allowed range (empty/invalid → default). */
function normalizeProjectDays() {
  const raw = viewSettings.defaultProjectDays
  if (!Number.isFinite(raw)) {
    viewSettings.defaultProjectDays = 180
    return
  }
  viewSettings.defaultProjectDays = Math.min(
    PROJECT_DAYS_MAX,
    Math.max(PROJECT_DAYS_MIN, Math.round(raw)),
  )
}

/** Enter in the number field commits the value and closes editing. */
function onProjectDaysEnter(e: KeyboardEvent) {
  normalizeProjectDays()
  ;(e.target as HTMLInputElement).blur()
}

/** Applies the URL from the field to the runtime config; false — invalid URL */
function applyApiUrl(): boolean {
  const warn = httpSchemeWarning(apiUrl.value)
  if (warn) notifyInfo(warn)
  const applied = setApiUrl(apiUrl.value, true)
  if (!applied) {
    notifyError('Некорректный API_URL: ожидается http(s)://…')
  }
  return applied
}

/** The "Save" button for API_URL: validates and saves to localStorage */
function onSaveApiUrl() {
  if (!applyApiUrl()) return
  notifySuccess('API_URL сохранён')
}

watch(autoSync, saveSyncSettings)
watch([notificationsEnabled, notifyDurationMs], saveNotifySettings)
watch([uiFontSize, tablePageSize], () => {
  applyUiSize()
  saveUiSettings()
})
watch(scheme, (value) => setScheme(value))

onMounted(() => {
  apiUrl.value = getApiUrl() ?? ''
})
</script>

<template>
  <section class="st">
    <h2 class="st-title">Настройки</h2>

    <!-- Section switcher: segmented control -->
    <div class="st-seg" role="tablist" aria-label="Разделы настроек">
      <button
        v-for="sec in SECTIONS"
        :key="sec.id"
        type="button"
        role="tab"
        class="st-seg-tab"
        :class="{ on: activeSection === sec.id }"
        :aria-selected="activeSection === sec.id"
        @click="activeSection = sec.id"
      >
        {{ sec.label }}
      </button>
    </div>

    <!-- Интерфейс -->
    <template v-if="activeSection === 'interface'">
      <div class="st-card">
        <h3 class="st-card-title">Интерфейс</h3>
        <div class="st-field">
          <span>Цветовая тема</span>
          <select v-model="scheme" class="st-select">
            <option value="system">Как в системе</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </div>
        <div class="st-field">
          <span>Размер шрифта интерфейса</span>
          <select v-model="uiFontSize" class="st-select">
            <option value="small">Мелкий</option>
            <option value="default">Средний</option>
            <option value="large">Крупный</option>
          </select>
          <p class="st-hint">Применяется сразу, без перезагрузки.</p>
        </div>
        <div class="st-field">
          <span>Язык интерфейса</span>
          <select v-model="uiLanguage" class="st-select">
            <option value="auto">Как в системе</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
          <p class="st-hint">Применяется сразу; «Как в системе» — язык браузера.</p>
        </div>
      </div>

      <div class="st-card">
        <h3 class="st-card-title">Уведомления</h3>
        <label class="st-option">
          <input v-model="notificationsEnabled" type="checkbox" />
          <span>Показывать стек уведомлений</span>
        </label>
        <div class="st-field">
          <span>Время показа сообщений</span>
          <select v-model.number="notifyDurationMs" class="st-select">
            <option v-for="ms in NOTIFY_DURATION_OPTIONS" :key="ms" :value="ms">{{ ms / 1000 }} сек</option>
            <option :value="0">Не скрывать</option>
          </select>
          <p class="st-hint">«Не скрывать» — сообщение остаётся, пока его не закроют вручную.</p>
        </div>
      </div>
    </template>

    <!-- Таблицы -->
    <template v-if="activeSection === 'tables'">
      <div class="st-card">
        <h3 class="st-card-title">Таблицы</h3>
        <div class="st-field">
          <span>Записей на странице</span>
          <select v-model.number="tablePageSize" class="st-select">
            <option v-for="n in TABLE_PAGE_SIZE_OPTIONS" :key="n" :value="n">{{ n }}</option>
          </select>
          <p class="st-hint">
            Для списков с «Показать ещё» (ресурсы, сотрудники) и журнала действий. Применяется со следующей загрузки списка.
          </p>
        </div>
      </div>
    </template>

    <!-- Диаграммы -->
    <template v-if="activeSection === 'diagrams'">
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
          <span>Длительность проекта по умолчанию</span>
          <div class="st-num-row">
            <input
              v-model.number="viewSettings.defaultProjectDays"
              type="number"
              :min="PROJECT_DAYS_MIN"
              :max="PROJECT_DAYS_MAX"
              step="1"
              class="st-num"
              aria-label="Длительность проекта по умолчанию, дней"
              @blur="normalizeProjectDays"
              @keydown.enter="onProjectDaysEnter"
            />
            <span class="st-num-unit">дн.</span>
          </div>
          <p class="st-hint">На столько дней создаётся проект по кнопке «Создать» или правым кликом по шкале</p>
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
    </template>

    <!-- Синхронизация -->
    <template v-if="activeSection === 'sync'">
      <div class="st-card">
        <h3 class="st-card-title">Синхронизация</h3>
        <label class="st-option">
          <input v-model="autoSync" type="checkbox" />
          <span>Автосинхронизация при запуске и возврате сети</span>
        </label>
      </div>
    </template>

    <!-- Подключение -->
    <template v-if="activeSection === 'connection'">
      <div class="st-card">
        <h3 class="st-card-title">Подключение</h3>
        <label class="st-field">
          <span>API_URL бэкенда</span>
          <input v-model="apiUrl" type="text" spellcheck="false" placeholder="https://host/api/v1" />
        </label>
        <div class="st-actions st-actions--tight">
          <button type="button" class="st-btn st-btn--sm" @click="onSaveApiUrl">
            Сохранить
          </button>
        </div>
        <p class="st-hint">
          Источник: {{ hasApiUrlOverride() ? 'задан вручную' : 'по умолчанию' }}.
        </p>
      </div>
    </template>

    </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.st-title {
  font-size: calc(var(--ui-font-scale, 1) * 24px);
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 20px;
}

/* Section switcher — segmented control */
.st-seg {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  width: fit-content;
  background: var(--ui-surface-2);
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 18px;
}
.st-seg-tab {
  border: none;
  background: transparent;
  color: var(--ui-text-2);
  font: inherit;
  font-size: calc(var(--ui-font-scale, 1) * 13.5px);
  font-weight: 600;
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background var(--ui-duration), color var(--ui-duration);
}
.st-seg-tab:hover {
  color: var(--ui-text);
}
.st-seg-tab.on {
  background: var(--ui-surface);
  color: var(--ui-text);
  box-shadow: var(--ui-shadow-sm);
}

.st-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
  padding: 20px;
  margin-bottom: 12px;
  /* Settings read best as neat, bounded cards — not full-width slabs */
  width: 100%;
  max-width: 640px;
}

.st-card-title {
  font-size: calc(var(--ui-font-scale, 1) * 18px);
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 16px;
}

.st-hint {
  margin: 0 0 12px;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  color: var(--ui-text-muted);
}

.st-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  color: var(--ui-text-2);
  cursor: pointer;
}

.st-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 600;
  color: var(--ui-text-2);
}

.st-field input[type='text'],
.st-field input[type='password'],
.st-field input[type='number'] {
  padding: 11px 14px;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  font-size: calc(var(--ui-font-scale, 1) * 14px);
  font-weight: 400;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}

/* Select in the Notifications card (same visual language as the fields) */
.st-select {
  padding: 9px 12px;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  font-size: calc(var(--ui-font-scale, 1) * 14px);
  font-family: inherit;
  font-weight: 400;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}
.st-select:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
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
  font-size: calc(var(--ui-font-scale, 1) * 14px);
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
  font-size: calc(var(--ui-font-scale, 1) * 13px);
}

.st-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.st-actions--tight {
  margin-top: 0;
}

.st-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
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
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 700;
  color: var(--ui-text);
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: right;
}
/* Number input for the default project duration (typed, not a slider) */
.st-num-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.st-num {
  box-sizing: border-box;
  width: 110px;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 8px 10px;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
  transition: border-color var(--ui-duration), box-shadow var(--ui-duration);
}
.st-num:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.st-num-unit {
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  color: var(--ui-text-2);
}
</style>
