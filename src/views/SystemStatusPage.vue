<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { lastPullAt } from '../offline/connection'
import { lastPushAt } from '../offline/sync'
import { pendingCount, refreshPendingCount } from '../offline/outbox'
import { idbCount } from '../offline/db'
import { isOffline } from '../offline/state'

// === App / offline ===
const appVersion = ref('—')
/** Version of the running bundle (injected at build time; in dev — 'dev-...') */
const appBuildVersion = __APP_VERSION__
const cachedAssets = ref(0)
const cachedData = ref(0)

let refreshTimer: number | null = null

const lastPullLabel = computed(() =>
  lastPullAt.value != null
    ? new Date(lastPullAt.value).toLocaleString('ru-RU')
    : 'ещё не было',
)

const lastPushLabel = computed(() =>
  lastPushAt.value != null
    ? new Date(lastPushAt.value).toLocaleString('ru-RU')
    : 'ещё не было',
)

const connectionLabel = computed(() => (isOffline.value ? 'офлайн' : 'онлайн'))

/** Build version and offline cache sizes (for the "App and offline" card) */
async function refreshAppInfo() {
  try {
    const res = await fetch('/precache-manifest.json')
    if (res.ok) {
      const data = (await res.json()) as { version?: string }
      appVersion.value = data.version ?? '—'
    }
  } catch {
    // offline — the build version is not critical
  }
  try {
    const cacheNames = await caches.keys()
    let count = 0
    for (const name of cacheNames) {
      const c = await caches.open(name)
      const keys = await c.keys()
      count += keys.filter((r) => r.url.includes('/assets/')).length
    }
    cachedAssets.value = count
  } catch {
    cachedAssets.value = 0
  }
}

async function refreshStatus() {
  await refreshPendingCount().catch(() => {})
  cachedData.value = await idbCount('cache').catch(() => 0)
  await refreshAppInfo()
}

onMounted(() => {
  void refreshStatus()
  refreshTimer = window.setInterval(refreshStatus, 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer != null) window.clearInterval(refreshTimer)
})
</script>

<template>
  <section class="ss">
    <h2 class="ss-title">Статус</h2>

    <div class="ss-card">
      <h3 class="ss-card-title">Соединение</h3>
      <div class="ss-status-rows">
        <div class="ss-row">
          <span class="ss-label">Соединение</span>
          <span class="ss-value" :class="isOffline ? 'off' : 'on'">
            {{ connectionLabel }}
          </span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Последний PULL</span>
          <span class="ss-value">{{ lastPullLabel }}</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Последний PUSH</span>
          <span class="ss-value">{{ lastPushLabel }}</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Ожидают отправки</span>
          <span class="ss-value">{{ pendingCount }}</span>
        </div>
      </div>
    </div>

    <div class="ss-card">
      <h3 class="ss-card-title">Приложение и офлайн</h3>
      <div class="ss-status-rows">
        <div class="ss-row">
          <span class="ss-label">Версия приложения</span>
          <span class="ss-value">{{ appVersion }}</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Версия сборки (запущенная)</span>
          <span class="ss-value">{{ appBuildVersion }}</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Кэш ассетов</span>
          <span class="ss-value">{{ cachedAssets }} чанков</span>
        </div>
        <div class="ss-row">
          <span class="ss-label">Сохранённых данных</span>
          <span class="ss-value">{{ cachedData }} записей</span>
        </div>
      </div>
      <p v-if="cachedData === 0" class="ss-msg warn">
        Кэш данных пуст. Для офлайна зайдите онлайн и нажмите «PULL» в «Пульте».
      </p>
    </div>

  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.ss-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin-bottom: 20px;
}

.ss-card {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
  padding: 20px;
  margin-bottom: 24px;
}

.ss-card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 16px;
}

.ss-status-rows {
  margin-bottom: 6px;
}

.ss-row {
  display: flex;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid var(--ui-border);
  font-size: 13px;
}

.ss-row:last-child {
  border-bottom: none;
}

.ss-label {
  color: var(--ui-text-muted);
}

.ss-value {
  font-weight: 600;
  color: var(--ui-text);
}

.ss-value.on {
  color: var(--ui-success);
}

.ss-value.off {
  color: var(--ui-warning);
}
</style>
