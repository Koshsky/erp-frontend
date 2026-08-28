<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../../store'
import { useNavigation } from '../../../composables/useNavigation'
import type { NavCategory } from '../../../composables/useNavigation'
import { isElectron } from '../../../electron'
import { isOffline } from '../../../offline/state'
import { pendingCount } from '../../../offline/outbox'

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
.ah {
  background: #1a73e8;
  color: #fff;
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  position: sticky;
  top: 0;
  /* Header and its dropdown menus sit above page content; modal dialogs
     (z-40000) render above the header and dim it */
  z-index: 30000;
}

.ah-brand {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.ah-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ah-link,
.ah-cat {
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s, color 0.15s;
}

.ah-link:hover,
.ah-cat:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.ah-cat.active,
.ah-link.active {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-weight: 600;
}

.ah-caret {
  font-size: 10px;
  opacity: 0.8;
}

.ah-sync-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: #f39c12;
  color: #fff;
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
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  border: 1px solid #e8e8e8;
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
  color: #333;
  text-decoration: none;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}

.ah-menu-item:hover {
  background: #f2f6fc;
  color: #1a73e8;
}

.ah-menu-item.active {
  background: #e8f0fe;
  color: #1a73e8;
  font-weight: 600;
}

.ah-spacer {
  flex: 1;
}

.ah-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ah-logout {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.ah-logout:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.28);
  color: #fff;
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
