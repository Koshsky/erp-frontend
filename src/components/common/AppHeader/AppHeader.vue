<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../../store'
import { useNavigation } from '../../../composables/useNavigation'
import { isElectron } from '../../../electron'
import { isOffline } from '../../../offline/state'
import { pendingCount } from '../../../offline/outbox'
import { lastPullAt } from '../../../offline/cycle'
import { resolvedScheme, toggleScheme } from '../../../theme'
import { AppIcon } from '../AppIcon'
import { AppNavDrawer } from '../AppNavDrawer'
import type { DrawerSyncStats } from '../AppNavDrawer/types'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// Local computed wrapping the imported ref — guaranteed reactivity
// in the template (imported refs are bound without auto-unwrapping).
const offline = computed(() => isOffline.value)

// Pending changes awaiting sync (badge next to «Синхронизация» in the drawer)
const pending = computed(() => pendingCount.value)

// Reactive clock so the freshness label keeps advancing while mounted
// (a computed reading Date.now() alone would freeze after the last pull).
const CLOCK_TICK_MS = 30_000
const now = ref(Date.now())
let clockTimer: number | undefined

// Data freshness (desktop): how long ago the background PULL last updated the cache
const lastPullLabel = computed(() => {
  const ts = lastPullAt.value
  if (ts == null) return null
  const s = Math.max(0, Math.round((now.value - ts) / 1000))
  if (s < 60) return `${s} с`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} мин`
  const h = Math.round(m / 60)
  return `${h} ч`
})

// Route name as a plain string (route.name can also be a symbol in edge cases)
const routeName = computed(() => (typeof route.name === 'string' ? route.name : undefined))

// Permission-filtered categories; the drawer is the only place they render now
const { visibleCategories } = useNavigation()

// Theme toggle label (Russian UI copy)
const themeLabel = computed(() => (resolvedScheme.value === 'dark' ? 'Светлая' : 'Тёмная'))

// ---------------------------------------------------------------------------
// Left drawer state:
//   'closed' — hidden,
//   'pinned' — opened by the burger / Ctrl+B, stays open,
//   'peek'   — edge-opened by holding the pointer at the left screen edge;
//              slides back when the pointer leaves the panel.
// ---------------------------------------------------------------------------
const navState = ref<'closed' | 'peek' | 'pinned'>('closed')
const burgerRef = ref<HTMLElement | null>(null)

/** Drawer is visible in every state except 'closed' */
const navOpen = computed(() => navState.value !== 'closed')

function toggleNav(): void {
  // Burger / Ctrl+B: toggle pinned <-> closed; a peeked drawer becomes pinned.
  navState.value = navState.value === 'pinned' ? 'closed' : 'pinned'
}

function onCloseNav(): void {
  navState.value = 'closed'
  // Return focus to the burger that opened the drawer
  void nextTick(() => burgerRef.value?.focus())
}

// ---------------------------------------------------------------------------
// Edge-open behaviour:
//  - closing the mouse against the left screen edge (x <= EDGE_X) peeks the
//    drawer after a short hold (avoids accidental opens when moving across
//    the edge);
//  - a peeked drawer closes again once the pointer leaves the panel area
//    (with a short grace period so it does not slam shut on tiny movements);
//  - a pinned drawer is unaffected by pointer position.
// ---------------------------------------------------------------------------
const EDGE_X = 12
const EDGE_HOLD_MS = 120
const EDGE_CLOSE_MS = 220
const PANEL_WIDTH = 280

let edgeHoverTimer: number | undefined
let edgeLeaveTimer: number | undefined

function clearEdgeTimers(): void {
  if (edgeHoverTimer != null) {
    window.clearTimeout(edgeHoverTimer)
    edgeHoverTimer = undefined
  }
  if (edgeLeaveTimer != null) {
    window.clearTimeout(edgeLeaveTimer)
    edgeLeaveTimer = undefined
  }
}

function onGlobalMouseMove(e: MouseEvent): void {
  const x = e.clientX

  if (navState.value === 'closed') {
    if (x <= EDGE_X && edgeHoverTimer == null) {
      edgeHoverTimer = window.setTimeout(() => {
        edgeHoverTimer = undefined
        if (navState.value === 'closed') navState.value = 'peek'
      }, EDGE_HOLD_MS)
    } else if (x > EDGE_X && edgeHoverTimer != null) {
      window.clearTimeout(edgeHoverTimer)
      edgeHoverTimer = undefined
    }
  } else if (navState.value === 'peek') {
    if (x > PANEL_WIDTH + EDGE_X && edgeLeaveTimer == null) {
      edgeLeaveTimer = window.setTimeout(() => {
        edgeLeaveTimer = undefined
        if (navState.value === 'peek') navState.value = 'closed'
      }, EDGE_CLOSE_MS)
    } else if (x <= PANEL_WIDTH + EDGE_X && edgeLeaveTimer != null) {
      window.clearTimeout(edgeLeaveTimer)
      edgeLeaveTimer = undefined
    }
  }
}

// Ctrl/Cmd+B toggles the drawer (common desktop shortcut)
function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyB') {
    e.preventDefault()
    toggleNav()
  }
}

// Close the drawer on any programmatic navigation (router guards, redirects)
watch(
  () => route.name,
  () => {
    if (navState.value !== 'closed') navState.value = 'closed'
  },
)

function onLogout(): void {
  // Handler-level safeguard: offline logout is not performed (logout
  // clears the outbox), even if the disabled attribute did not fire.
  if (offline.value) return
  authStore.logout()
  router.push('/login')
}

const burgerTitle = computed(() =>
  isElectron
    ? `Меню · ${offline.value ? 'офлайн: данные из кэша' : 'онлайн'} (Ctrl+B)`
    : 'Меню (Ctrl+B)',
)

// Sync stats block for the drawer footer (can be passed live)
const syncStats = computed<DrawerSyncStats>(() => ({
  enabled: isElectron,
  offline: offline.value,
  pending: pending.value,
  lastPullLabel: lastPullLabel.value,
}))

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('mousemove', onGlobalMouseMove, { passive: true })
  clockTimer = window.setInterval(() => {
    now.value = Date.now()
  }, CLOCK_TICK_MS)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('mousemove', onGlobalMouseMove)
  clearEdgeTimers()
  if (clockTimer != null) window.clearInterval(clockTimer)
})
</script>

<template>
  <header class="ah">
    <!-- Burger: the only entry point to the left drawer; a status dot on top
         (desktop) shows the sync state without cluttering the topbar -->
    <button
      ref="burgerRef"
      type="button"
      class="ah-burger"
      :aria-label="'Открыть меню'"
      :aria-expanded="navOpen"
      :title="burgerTitle"
      @click="toggleNav"
    >
      <AppIcon name="menu" :size="22" />
      <span v-if="isElectron" class="ah-burger-dot" :class="{ on: !offline }"></span>
    </button>

    <div class="ah-spacer"></div>

    <div class="ah-actions">
      <RouterLink to="/profile" class="ah-act" :class="{ active: route.name === 'profile' }">
        <AppIcon name="user" :size="18" />
        <span>Профиль</span>
      </RouterLink>
      <button
        type="button"
        class="ah-act ah-act--icon"
        :title="'Переключить тему (сейчас ' + themeLabel.toLowerCase() + ')'"
        :aria-label="'Переключить тему'"
        @click="toggleScheme"
      >
        <AppIcon :name="resolvedScheme === 'dark' ? 'sun' : 'moon'" :size="18" />
      </button>
      <!-- Logout is unavailable offline: logout clears the outbox, which must be kept until the network is back -->
      <button
        type="button"
        class="ah-act ah-act--icon ah-act--logout"
        :class="{ 'ah-act--off': offline }"
        :disabled="offline"
        :title="offline ? 'Выход недоступен офлайн: очередь изменений сохранится до возврата сети' : 'Выйти из системы'"
        :aria-label="'Выйти из системы'"
        @click="onLogout"
      >
        <AppIcon name="logout" :size="18" />
      </button>
    </div>
  </header>

  <!-- Navigation drawer: the only place modules live now -->
  <AppNavDrawer
    :open="navOpen"
    :categories="visibleCategories"
    :active-name="routeName"
    :sync="syncStats"
    @close="onCloseNav"
  />
</template>

<style scoped>
@import '../../../styles/tokens.css';

.ah {
  width: 100%; /* the header width never depends on the page or scrollbars */
  /* The header is a flex item of .ml (column flex): without this the flex
     shrink distribution on viewport-filling diagram pages squeezes the header
     height below 60px (the timeline is taller than the container). flex: none
     keeps the header size dependent only on the screen, never on page content. */
  flex: none;
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 0 16px 0 8px;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--ui-shadow-sm);
  border-bottom: 1px solid var(--ui-border);
  position: sticky;
  top: 0;
  /* Header and the drawer sit above page content; modal dialogs
     (z-40000) render above them and dim everything */
  z-index: 30000;
}

.ah-burger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-2);
  cursor: pointer;
  transition: background var(--ui-duration), color var(--ui-duration);
}

.ah-burger:hover {
  background: var(--ui-surface-3);
  color: var(--ui-text);
}

.ah-burger:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

/* Sync state dot on the burger (desktop): green = online, amber = offline */
.ah-burger-dot {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 2px solid var(--ui-surface);
  background: var(--ui-warning);
}

.ah-burger-dot.on {
  background: var(--ui-success);
}

.ah-spacer {
  flex: 1;
}

.ah-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ah-act {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 14px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-2);
  text-decoration: none;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--ui-duration), color var(--ui-duration);
}

.ah-act:hover:not(:disabled) {
  background: var(--ui-surface-3);
  color: var(--ui-text);
}

.ah-act.active {
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  font-weight: 600;
}

/* Icon-only actions (theme toggle, logout): square, no label */
.ah-act--icon {
  width: 42px;
  padding: 0;
  justify-content: center;
}

.ah-act--logout:hover:not(:disabled) {
  background: var(--ui-danger-soft);
  border-color: var(--ui-danger);
  color: var(--ui-danger);
}

.ah-act:disabled,
.ah-act--off {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

/* Narrow screens: one row, icons only (touch targets stay >= 44px) */
@media (max-width: 720px) {
  .ah {
    padding: 0 8px;
    gap: 4px;
  }

  .ah-act {
    width: 48px;
    padding: 0;
    justify-content: center;
  }

  .ah-act span {
    display: none;
  }

  .ah-actions {
    gap: 2px;
  }
}
</style>