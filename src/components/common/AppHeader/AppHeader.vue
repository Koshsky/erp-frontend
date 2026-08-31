<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../../store'
import { useNavigation } from '../../../composables/useNavigation'
import type { NavCategory } from '../../../composables/useNavigation'
import { isElectron } from '../../../electron'
import { isOffline } from '../../../offline/state'
import { pendingCount } from '../../../offline/outbox'
import { resolvedScheme, toggleScheme } from '../../../theme'

const props = withDefaults(defineProps<{ brand?: string }>(), { brand: 'MVS ERP' })

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// Local computed wrapping the imported ref — guaranteed reactivity
// in the template (imported refs are bound without auto-unwrapping).
const offline = computed(() => isOffline.value)

// Pending changes awaiting sync (badge next to "Sync")
const pending = computed(() => pendingCount.value)

// Header — list of categories; subcategories open in a dropdown menu.
const { visibleCategories, activeCategory } = useNavigation()

// shallowRef: keeps the category object as-is (no deep-reactive wrapper)
// so identity comparison openCategory === cat works.
const openCategory = shallowRef<NavCategory | null>(null)
const navEl = ref<HTMLElement | null>(null)

// Theme toggle label (Russian UI copy)
const themeLabel = computed(() => (resolvedScheme.value === 'dark' ? 'Светлая' : 'Тёмная'))

function toggleCategory(cat: NavCategory) {
  openCategory.value = openCategory.value === cat ? null : cat
}

function closeCategory() {
  openCategory.value = null
}

function onLogout() {
  // Handler-level safeguard: offline logout is not performed (logout
  // clears the outbox), even if the disabled attribute did not fire.
  if (offline.value) return
  authStore.logout()
  router.push('/login')
}

// Click outside the menu or Escape — close
function onDocClick(e: MouseEvent) {
  if (navEl.value && !navEl.value.contains(e.target as Node)) closeCategory()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeCategory()
}

watch(openCategory, (oc) => {
  if (oc) {
    window.addEventListener('click', onDocClick)
    window.addEventListener('keydown', onKeydown)
  } else {
    window.removeEventListener('click', onDocClick)
    window.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('click', onDocClick)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <header class="ah">
    <div class="ah-brand">{{ props.brand }}</div>
    <nav ref="navEl" class="ah-nav">
      <div
        v-for="cat in visibleCategories"
        :key="cat.label"
        class="ah-cat-wrap"
      >
        <button
          type="button"
          class="ah-cat"
          :class="{ active: activeCategory === cat || openCategory === cat }"
          @click="toggleCategory(cat)"
        >
          {{ cat.label }}
          <span class="ah-caret">▾</span>
        </button>
        <div v-if="openCategory === cat" class="ah-menu" role="menu">
          <RouterLink
            v-for="item in cat.items"
            :key="item.to"
            :to="item.to"
            class="ah-menu-item"
            :class="{ active: item.name === route.name }"
            role="menuitem"
            @click="closeCategory"
          >
            {{ item.label }}
          </RouterLink>
        </div>
      </div>
    </nav>
    <div class="ah-spacer"></div>
    <div class="ah-actions">
      <RouterLink to="/profile" class="ah-link" :class="{ active: route.name === 'profile' }">Профиль</RouterLink>
      <RouterLink v-if="isElectron" to="/sync" class="ah-link" :class="{ active: route.name === 'sync' }">
        Синхронизация
        <span v-if="pending > 0" class="ah-sync-badge" :title="`Ожидают отправки: ${pending}`">
          {{ pending }}
        </span>
      </RouterLink>
      <!-- Color scheme toggle -->
      <button type="button" class="ah-theme" :title="'Переключить тему (сейчас ' + themeLabel.toLowerCase() + ')'" @click="toggleScheme">
        {{ themeLabel }}
      </button>
      <!-- Logout is unavailable offline: logout clears the outbox, which must be kept until the network is back -->
      <button
        type="button"
        class="ah-logout"
        :class="{ 'ah-logout--off': offline }"
        :disabled="offline"
        :title="offline ? 'Выход недоступен офлайн: очередь изменений сохранится до возврата сети' : undefined"
        @click="onLogout"
      >
        Выйти
      </button>
    </div>
  </header>
</template>

<style scoped>
@import '../../../styles/tokens.css';

.ah {
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 0 24px;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 32px;
  box-shadow: var(--ui-shadow-sm);
  border-bottom: 1px solid var(--ui-border);
  position: sticky;
  top: 0;
  /* Header and its dropdown menus sit above page content; modal dialogs
     (z-40000) render above the header and dim it */
  z-index: 30000;
}

.ah-brand {
  font-size: 20px;
  font-weight: 750;
  letter-spacing: 0.2px;
  color: var(--ui-text);
  white-space: nowrap;
}

.ah-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ah-link,
.ah-cat {
  color: var(--ui-text-2);
  text-decoration: none;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: var(--ui-radius-sm);
  border: none;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background var(--ui-duration), color var(--ui-duration);
}

.ah-link:hover,
.ah-cat:hover {
  background: var(--ui-surface-3);
  color: var(--ui-text);
}

.ah-cat.active,
.ah-link.active {
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  font-weight: 600;
}

.ah-caret {
  font-size: 10px;
  opacity: 0.75;
}

.ah-sync-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--ui-milestone);
  color: #4a3d14;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.ah-cat-wrap {
  position: relative;
}

.ah-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 200px;
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-lg);
  border: 1px solid var(--ui-border);
  padding: 6px;
  display: flex;
  flex-direction: column;
  /* Within the header's stacking context (z-30000) — above the rest of the header content */
  z-index: 100;
}

.ah-menu-item {
  display: block;
  padding: 9px 12px;
  border-radius: 7px;
  color: var(--ui-text);
  text-decoration: none;
  font-size: 14px;
  transition: background var(--ui-duration), color var(--ui-duration);
}

.ah-menu-item:hover {
  background: var(--ui-surface-3);
  color: var(--ui-accent);
}

.ah-menu-item.active {
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  font-weight: 600;
}

.ah-spacer {
  flex: 1;
}

.ah-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ah-theme {
  background: transparent;
  color: var(--ui-text-2);
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 6px 12px;
  font-size: 12.5px;
  cursor: pointer;
  transition: background var(--ui-duration), color var(--ui-duration), border-color var(--ui-duration);
}

.ah-theme:hover {
  background: var(--ui-surface-3);
  color: var(--ui-text);
}

.ah-logout {
  background: transparent;
  color: var(--ui-text-2);
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background var(--ui-duration), color var(--ui-duration), border-color var(--ui-duration);
}

.ah-logout:hover:not(:disabled) {
  background: var(--ui-danger-soft);
  border-color: var(--ui-danger);
  color: var(--ui-danger);
}

.ah-logout:disabled,
.ah-logout--off {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

@media (max-width: 720px) {
  .ah { flex-direction: column; height: auto; padding: 12px; gap: 12px; }
  .ah-spacer { display: none; }
}
</style>